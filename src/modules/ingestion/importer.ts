import type { EventFeed, PulseEvent, SourceId, SourceStatus } from "@/shared/types";
import { buildDemoEvents } from "@/fixtures/demo-events";
import { hasEnded } from "@/shared/time";
import { heelLifeAdapter, type SourceAdapter } from "./adapters";
import { uncCalendarAdapter } from "./unc-calendar";
import { carrboroAdapter } from "./carrboro";
import { ticketmasterAdapter } from "./ticketmaster";
import { acklandAdapter, moreheadAdapter } from "./tribe";
import { orangeCountyAdapter, uncLibrariesAdapter } from "./ics-feeds";
import { dedupeKey } from "./store";
import { createEnrichmentCache } from "./enrichment";
import { withClassification } from "@/modules/recommendations/classify";
import { TAXONOMY_VERSION } from "@/shared/taxonomy";

/** Source registry. All run independently; one failing never erases the others. */
export const ADAPTERS: SourceAdapter[] = [heelLifeAdapter, uncCalendarAdapter, carrboroAdapter, acklandAdapter, moreheadAdapter, uncLibrariesAdapter, orangeCountyAdapter, ticketmasterAdapter];

export const CACHE_TTL_MS = 15 * 60 * 1000;
/** Last-known-good snapshots are served (marked stale) for at most this long after a failure. */
export const STALE_MAX_MS = 6 * 60 * 60 * 1000;
export const WINDOW_DAYS = 30;

interface Snapshot {
  events: PulseEvent[];
  fetchedAt: string;
  complete: boolean;
  skipped: number;
}

interface SourceState {
  good: Snapshot | null;
  lastStatus: SourceStatus["status"] | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  warnings: string[];
}

export interface Importer {
  getFeed(now?: Date): Promise<EventFeed>;
  refresh(force: boolean, now?: Date): Promise<void>;
}

export function createImporter(adapters: SourceAdapter[] = ADAPTERS, opts: { windowDays?: number } = {}): Importer {
  const states = new Map<SourceId, SourceState>(adapters.map((a) => [a.id, { good: null, lastStatus: null, lastError: null, lastAttemptAt: null, warnings: [] }]));
  let lastRefreshAt = 0;
  let inFlight: Promise<void> | null = null;

  async function runOne(a: SourceAdapter, now: Date) {
    const st = states.get(a.id)!;
    const fetchedAt = now.toISOString();
    st.lastAttemptAt = fetchedAt;
    try {
      const r = await a.fetch({ now, fetchedAt, windowDays: opts.windowDays ?? WINDOW_DAYS });
      st.lastStatus = r.status;
      st.lastError = null;
      st.warnings = r.warnings;
      if (r.status === "ok") {
        // Dedupe within the source by canonical occurrence identity.
        const byId = new Map<string, PulseEvent>();
        for (const e of r.events) byId.set(dedupeKey(e), e);
        st.good = { events: [...byId.values()], fetchedAt, complete: r.complete, skipped: r.skipped };
      } else st.good = null;
    } catch (err) {
      st.lastStatus = "error";
      st.lastError = (err as Error).message.slice(0, 200);
      st.warnings = [];
      console.error(`[ingestion] ${a.id} failed:`, st.lastError);
    }
  }

  function refresh(force: boolean, now = new Date()): Promise<void> {
    if (!force && lastRefreshAt && now.getTime() - lastRefreshAt < CACHE_TTL_MS) return Promise.resolve();
    if (inFlight) return inFlight; // coalesce concurrent refreshes
    inFlight = Promise.all(adapters.map((a) => runOne(a, now)))
      .then(() => {
        lastRefreshAt = now.getTime();
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function getFeed(now = new Date()): Promise<EventFeed> {
    await refresh(false, now);
    const sources: SourceStatus[] = [];
    const events = new Map<string, PulseEvent>();
    const cancelled = new Set<string>();
    const warnings: string[] = [];
    let anyUsable = false;

    for (const a of adapters) {
      const st = states.get(a.id)!;
      const snap = st.good;
      const stale = st.lastStatus === "error" && !!snap;
      const usable = !!snap && (!stale || now.getTime() - Date.parse(snap.fetchedAt) < STALE_MAX_MS);
      let count = 0;
      if (usable && snap) {
        anyUsable = true;
        for (const e of snap.events) {
          if (e.status === "cancelled") {
            cancelled.add(e.id);
            continue;
          }
          if (hasEnded(e, now)) continue; // expiry rechecked at serve time
          events.set(e.id, e);
          count++;
        }
      }
      sources.push({
        source: a.id,
        status: st.lastStatus ?? "error",
        fetchedAt: usable && snap ? snap.fetchedAt : null,
        eventCount: count,
        complete: usable && snap ? snap.complete : false,
        stale: stale && usable,
        skipped: snap?.skipped ?? 0,
        error: st.lastError,
      });
      warnings.push(...st.warnings);
      if (st.lastStatus === "error") warnings.push(stale && usable ? `${a.id}: latest refresh failed; showing data from ${snap!.fetchedAt}.` : `${a.id}: unavailable.`);
    }

    if (anyUsable) {
      const list = [...events.values()].sort((x, y) => x.startsAt.localeCompare(y.startsAt));
      return { events: list, origin: "live", fetchedAt: new Date(lastRefreshAt || now.getTime()).toISOString(), warnings, sources, cancelledIds: [...cancelled] };
    }
    return {
      events: buildDemoEvents(),
      origin: "demo",
      fetchedAt: now.toISOString(),
      warnings: [...warnings, "Showing demo events — every live source failed."],
      sources,
      cancelledIds: [],
    };
  }

  return { getFeed, refresh };
}

const shared = createImporter();
/** In-memory AI enrichment cache (lost on restart; see enrichment.ts). */
const enrichment = createEnrichmentCache();

/** Cached read used by the app (per server instance; see README). Uses cached AI fields only — never waits on the model. */
export async function getFeed(): Promise<EventFeed> {
  const f = await shared.getFeed();
  if (f.origin !== "live") return f;
  // Deterministic taxonomy classification runs on every serve (cheap, no model);
  // stale classifications (old taxonomy version) are recomputed automatically.
  const classified = f.events.map((e) => (e.taxonomyVersion === TAXONOMY_VERSION ? e : withClassification(e)));
  return { ...f, events: enrichment.apply(classified) };
}

/** Privileged: callers must authorize first. */
export async function forceImport() {
  await shared.refresh(true);
  const f = await shared.getFeed();
  // Bounded enrichment inside the request (no detached background work).
  const { enrichWithGemini } = await import("./gemini");
  const ai = f.origin === "live" ? await enrichment.run(f.events, enrichWithGemini) : null;
  return { origin: f.origin, fetchedAt: f.fetchedAt, warnings: f.warnings, total: f.events.length, sources: f.sources, ai };
}
