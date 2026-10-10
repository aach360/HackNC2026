import type { EventFilters, PulseEvent, RankBreakdown, RankedEvent, Swipe, UserPreferences } from "@/shared/types";
import { REC_CONFIG as C } from "./config";
import { banditFeatures, banditModel } from "./bandit";
import { cosine, eventLabels, fnv, hashedLabelVector, meanVector } from "./vectors";

/**
 * Hybrid recommender:
 *   relevance = w_s·shrink(n)·semanticAffinity + w_r·θᵀx + w_e·min(α·√(xᵀA⁻¹x), cap) + w_t·soonness
 * followed by MMR diversity reranking of the top pool.
 * Semantic affinity uses embeddings when available; otherwise hashed category/tag vectors ("tag-fallback").
 */

export type VectorMap = Record<string, number[]>;

export interface EngineInput {
  events: PulseEvent[];
  swipes: Swipe[];
  prefs: UserPreferences;
  filters: EventFilters;
  now?: Date;
  /** Semantic vectors by event id (from the server embedding service). Missing → fallback. */
  vectors?: VectorMap;
  /** Events already in the plan are excluded from discovery. */
  planIds?: string[];
  /** Keep this event on top (the card under the user's finger). */
  frozenId?: string | null;
  /** Hard filter, injected so ranking.ts keeps owning filter semantics. */
  applyFilters: (events: PulseEvent[], f: EventFilters, now: Date) => PulseEvent[];
  /** All known events (for building profiles from past swipes); defaults to `events`. */
  history?: PulseEvent[];
}

interface Profile {
  semantic: { full: number[] | null; recent: number[] | null; neg: number[] | null; likes: number };
  fallback: { full: number[] | null; recent: number[] | null; neg: number[] | null; likes: number };
  recentLabels: Map<string, number>;
  likes: number;
}

const FB_DIMS = C.semanticDims;
const fallbackVec = (e: PulseEvent) => hashedLabelVector(eventLabels(e), FB_DIMS);

function blend(full: number[] | null, recent: number[] | null): number[] | null {
  if (!full) return recent;
  if (!recent) return full;
  return meanVector([{ v: full, w: 1 - C.recentBlend }, { v: recent, w: C.recentBlend }], full.length);
}

export function buildProfile(swipes: Swipe[], byId: Map<string, PulseEvent>, vectors: VectorMap): Profile {
  const likes = swipes.filter((s) => s.direction === "like").map((s) => byId.get(s.eventId)).filter((e): e is PulseEvent => !!e);
  const passes = swipes.filter((s) => s.direction === "pass").map((s) => byId.get(s.eventId)).filter((e): e is PulseEvent => !!e);
  const recent = likes.slice(-C.recentLikes);
  const space = (get: (e: PulseEvent) => number[] | null | undefined, dims: number) => {
    const L = likes.map((e) => get(e)).filter((v): v is number[] => !!v);
    const R = recent.map((e) => get(e)).filter((v): v is number[] => !!v);
    const N = passes.map((e) => get(e)).filter((v): v is number[] => !!v);
    const full = meanVector(L.map((v) => ({ v, w: 1 })), dims);
    return { full: blend(full, meanVector(R.map((v) => ({ v, w: 1 })), dims)), recent: meanVector(R.map((v) => ({ v, w: 1 })), dims), neg: meanVector(N.map((v) => ({ v, w: 1 })), dims), likes: L.length };
  };
  const recentLabels = new Map<string, number>();
  for (const e of recent) for (const k of eventLabels(e)) recentLabels.set(k, (recentLabels.get(k) ?? 0) + 1);
  return { semantic: space((e) => vectors[e.id], C.semanticDims), fallback: space(fallbackVec, FB_DIMS), recentLabels, likes: likes.length };
}

function jitter(id: string) {
  return (fnv(id) % 1000) / 1000;
}

/** Same occurrence listed twice (e.g. two sources) → keep the first. Distinct start times are kept. */
function dedupeOccurrences(events: PulseEvent[]): PulseEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const k = `${e.title.trim().toLowerCase().replace(/\s+/g, " ")}|${e.startsAt}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

interface Scored {
  event: PulseEvent;
  rel: number;
  b: RankBreakdown;
  sem: number[] | null;
  fb: number[] | null;
}

function similarity(a: Scored, b: Scored): number {
  return a.sem && b.sem ? cosine(a.sem, b.sem) : cosine(a.fb, b.fb);
}

function reasonsFor(s: Omit<Scored, "b"> & { b: Omit<RankBreakdown, "reasons"> }, p: Profile, hoursAway: number, recentHit: string | null, recentBoost: boolean): string[] {
  const r: string[] = [];
  const W = C.weights;
  if (p.likes > 0 && s.b.semantic >= C.explainSemanticMin) {
    if (recentBoost && recentHit) r.push(`Matches your recent interest in ${recentHit}`);
    else r.push("Similar to events you saved");
  } else if (p.likes > 0 && s.b.predicted >= 0.15 && recentHit) {
    r.push(`Matches your recent interest in ${recentHit}`);
  }
  if (!r.length && s.b.exploration * 1 > Math.max(s.b.semantic, s.b.predicted, 0.05) && s.b.semantic < C.explainSemanticMin * W.semantic) r.push("A new topic to explore");
  if (hoursAway <= C.soonHours) r.push("Happening soon");
  return r;
}

export function rankHybrid(input: EngineInput): RankedEvent[] {
  const now = input.now ?? new Date();
  const vectors = input.vectors ?? {};
  const history = input.history ?? input.events;
  const byId = new Map(history.map((e) => [e.id, e]));
  for (const e of input.events) byId.set(e.id, e);
  const swiped = new Set(input.swipes.map((s) => s.eventId));
  const planned = new Set(input.planIds ?? []);
  const pool = dedupeOccurrences(
    input.applyFilters(input.events, input.filters, now).filter((e) => e.status !== "cancelled" && !swiped.has(e.id) && !planned.has(e.id)),
  );

  const profile = buildProfile(input.swipes, byId, vectors);
  const model = banditModel(input.prefs.bandit);
  const shrink = profile.likes / (profile.likes + C.shrinkK);
  const W = C.weights;

  const scored: Scored[] = pool.map((event) => {
    const sem = vectors[event.id] ?? null;
    const fb = fallbackVec(event);
    const useSem = !!sem && profile.semantic.likes > 0;
    const space = useSem ? profile.semantic : profile.fallback;
    const v = useSem ? sem : fb;
    const affinityFull = cosine(v, space.full) - C.negativeWeight * cosine(v, space.neg);
    const affinityRecent = cosine(v, space.recent);
    const x = banditFeatures(event, sem, now);
    const unc = model.uncertainty(x);
    const hoursAway = Math.max(0, (new Date(event.startsAt).getTime() - now.getTime()) / 3_600_000);
    const b = {
      mode: (sem ? "semantic" : "tag-fallback") as RankBreakdown["mode"],
      semantic: W.semantic * shrink * affinityFull,
      predicted: W.predicted * Math.max(-1, Math.min(1.5, model.predict(x))),
      exploration: W.exploration * Math.min(C.maxExploration, C.alpha * unc),
      uncertainty: unc,
      time: W.time / (1 + hoursAway / 48),
      diversityPenalty: 0,
      features: x,
    };
    let recentHit: string | null = null;
    let best = 0;
    for (const k of eventLabels(event)) {
      const c = profile.recentLabels.get(k) ?? 0;
      if (c > best) {
        best = c;
        recentHit = k.slice(4);
      }
    }
    const reasons = reasonsFor({ event, rel: 0, sem, fb, b }, profile, hoursAway, recentHit, affinityRecent > cosine(v, space.full) + 0.05);
    const rel = b.semantic + b.predicted + b.exploration + b.time + W.jitter * jitter(event.id);
    return { event, rel, sem, fb, b: { ...b, reasons } };
  });
  scored.sort((a, b) => b.rel - a.rel);

  // Freeze the visible card.
  const selected: Scored[] = [];
  const fi = input.frozenId ? scored.findIndex((s) => s.event.id === input.frozenId) : -1;
  if (fi >= 0) selected.push(scored.splice(fi, 1)[0]!);

  // MMR over the top pool: argmax λ·rel' − (1−λ)·max sim(selected).
  const candidates = scored.slice(0, C.mmrPool);
  const tail = scored.slice(C.mmrPool);
  if (candidates.length) {
    const lo = Math.min(...candidates.map((c) => c.rel));
    const hi = Math.max(...candidates.map((c) => c.rel));
    const relN = (c: Scored) => (hi - lo < 1e-9 ? 1 : (c.rel - lo) / (hi - lo));
    while (candidates.length) {
      let bi = 0;
      let bv = -Infinity;
      let bp = 0;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]!;
        const sim = selected.length ? Math.max(...selected.slice(-5).map((s) => similarity(c, s))) : 0;
        const val = C.mmrLambda * relN(c) - (1 - C.mmrLambda) * Math.max(0, sim);
        if (val > bv) {
          bv = val;
          bi = i;
          bp = (1 - C.mmrLambda) * Math.max(0, sim);
        }
      }
      const pick = candidates.splice(bi, 1)[0]!;
      pick.b.diversityPenalty = bp;
      selected.push(pick);
    }
  }
  selected.push(...tail);

  return selected.map((s) => ({
    event: s.event,
    score: Math.round(s.rel * 1000) / 1000,
    reason: s.b.reasons[0] ?? null,
    breakdown: s.b,
  }));
}
