import type { EventFeed, PulseEvent } from "@/shared/types";
import { buildDemoEvents } from "@/fixtures/demo-events";
import { heelLifeJsonAdapter, heelLifeRssAdapter, type SourceAdapter } from "./adapters";
import { createMemoryRepository, type EventRepository } from "./store";

/** Ordered: first adapter that succeeds wins; later ones are fallbacks. */
export const ADAPTERS: SourceAdapter[] = [heelLifeJsonAdapter, heelLifeRssAdapter];

const CACHE_TTL_MS = 15 * 60 * 1000;

interface ImporterState {
  repo: EventRepository;
  origin: EventFeed["origin"] | null;
  fetchedAt: string | null;
  warnings: string[];
  inFlight: Promise<void> | null;
}

const state: ImporterState = {
  repo: createMemoryRepository(),
  origin: null,
  fetchedAt: null,
  warnings: [],
  inFlight: null,
};

export async function runImport(adapters = ADAPTERS, repo = state.repo, now = new Date()) {
  const fetchedAt = now.toISOString();
  const warnings: string[] = [];
  for (const a of adapters) {
    try {
      const events = await a.fetchEvents({ now, fetchedAt });
      const result = repo.upsertMany(events);
      return { origin: a.name, fetchedAt, warnings, ...result, count: events.length };
    } catch (err) {
      warnings.push(`${a.name} failed: ${(err as Error).message}`);
    }
  }
  return { origin: "demo" as const, fetchedAt, warnings, inserted: 0, updated: 0, count: 0 };
}

async function refresh(force: boolean) {
  const fresh = state.fetchedAt && Date.now() - new Date(state.fetchedAt).getTime() < CACHE_TTL_MS;
  if (!force && fresh) return;
  if (state.inFlight) return state.inFlight;
  state.inFlight = (async () => {
    const r = await runImport();
    state.origin = r.origin;
    state.fetchedAt = r.fetchedAt;
    state.warnings = r.warnings;
  })().finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
}

/** Cached read used by the app. Never hits Heel Life more than once per TTL. */
export async function getFeed(): Promise<EventFeed> {
  await refresh(false);
  const real = state.repo.listUpcoming();
  if (state.origin && state.origin !== "demo" && real.length) {
    return { events: real, origin: state.origin, fetchedAt: state.fetchedAt!, warnings: state.warnings };
  }
  const demo: PulseEvent[] = buildDemoEvents();
  return {
    events: demo,
    origin: "demo",
    fetchedAt: new Date().toISOString(),
    warnings: [...state.warnings, "Showing demo events — live sources unavailable."],
  };
}

/** Privileged: callers must authorize first. */
export async function forceImport() {
  await refresh(true);
  return { origin: state.origin, fetchedAt: state.fetchedAt, warnings: state.warnings, total: state.repo.listUpcoming().length };
}
