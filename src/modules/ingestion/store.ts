import type { PulseEvent } from "@/shared/types";
import { hasEnded } from "@/shared/time";

/** Dedupe key: source family + source event ID (JSON and RSS share "heellife"). */
export function dedupeKey(e: Pick<PulseEvent, "source" | "sourceEventId">): string {
  const family = e.source.startsWith("heellife") ? "heellife" : e.source;
  return `${family}:${e.sourceEventId}`;
}

/**
 * Event repository. Default implementation is in-memory (per server instance).
 * Swap for a database-backed version (see supabase/schema.sql) without
 * changing callers.
 */
export interface EventRepository {
  upsertMany(events: PulseEvent[]): { inserted: number; updated: number };
  listUpcoming(now?: Date): PulseEvent[];
  clear(): void;
}

export function createMemoryRepository(): EventRepository {
  const map = new Map<string, PulseEvent>();
  return {
    upsertMany(events) {
      let inserted = 0;
      let updated = 0;
      for (const e of events) {
        const key = dedupeKey(e);
        const prev = map.get(key);
        if (prev) {
          updated++;
          // Keep AI enrichment from earlier imports; source facts always win.
          map.set(key, { ...e, aiSummary: e.aiSummary ?? prev.aiSummary, aiTags: e.aiTags ?? prev.aiTags });
        } else {
          inserted++;
          map.set(key, e);
        }
      }
      return { inserted, updated };
    },
    listUpcoming(now = new Date()) {
      return [...map.values()]
        .filter((e) => !hasEnded(e, now) && e.status !== "cancelled")
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
    clear() {
      map.clear();
    },
  };
}
