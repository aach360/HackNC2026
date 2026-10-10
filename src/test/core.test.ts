import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/modules/ingestion/store";
import { mapHeelLifeJson, parseHeelLifeRss } from "@/modules/ingestion/adapters";
import { runImport } from "@/modules/ingestion/importer";
import { buildDemoEvents } from "@/fixtures/demo-events";
import { applySwipe, emptyPreferences, getRecommendations } from "@/modules/recommendations/ranking";
import { createLocalStorage, emptyUserState } from "@/modules/recommendations/storage";
import { getPlan } from "@/modules/plan/plan";
import type { PulseEvent } from "@/shared/types";

const now = new Date("2026-10-10T16:00:00Z");
const json = (id: string, startsOn: string, endsOn: string, name = "Event") =>
  mapHeelLifeJson({ id, name, startsOn, endsOn, description: "<p>Hi &amp; <b>welcome</b></p>", theme: "Arts", benefitNames: ["Free Food"] }, now.toISOString());

describe("ingestion", () => {
  it("dedupes across JSON and RSS and updates on re-import", () => {
    const repo = createMemoryRepository();
    repo.upsertMany([json("1", "2026-10-11T20:00:00Z", "2026-10-11T22:00:00Z", "Old title")]);
    const rss = parseHeelLifeRss(
      `<item><title>New title</title><link>https://heellife.unc.edu/event/1</link><start xmlns="events">Sun, 11 Oct 2026 20:00:00 GMT</start><end xmlns="events">Sun, 11 Oct 2026 22:00:00 GMT</end><category>Arts</category></item>`,
      now.toISOString(),
    );
    const r = repo.upsertMany(rss);
    expect(r).toEqual({ inserted: 0, updated: 1 });
    const list = repo.listUpcoming(now);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("New title");
    expect(list[0].sourceUrl).toBe("https://heellife.unc.edu/event/1");
  });

  it("excludes ended events", () => {
    const repo = createMemoryRepository();
    repo.upsertMany([json("a", "2026-10-09T20:00:00Z", "2026-10-09T22:00:00Z"), json("b", "2026-10-12T20:00:00Z", "2026-10-12T22:00:00Z")]);
    expect(repo.listUpcoming(now).map((e) => e.sourceEventId)).toEqual(["b"]);
  });

  it("strips HTML and never treats free food as free admission", () => {
    const e = json("x", "2026-10-12T20:00:00Z", "2026-10-12T22:00:00Z");
    expect(e.description).toBe("Hi & welcome");
    expect(e.tags).toContain("free food");
    expect(e.costAmount).toBeNull();
  });

  it("falls back to the next adapter when one fails", async () => {
    const repo = createMemoryRepository();
    const r = await runImport(
      [
        { name: "heellife-json", fetchEvents: async () => { throw new Error("boom"); } },
        { name: "heellife-rss", fetchEvents: async () => [json("r", "2026-10-12T20:00:00Z", "2026-10-12T22:00:00Z")] },
      ],
      repo,
      now,
    );
    expect(r.origin).toBe("heellife-rss");
    expect(r.warnings[0]).toMatch(/boom/);
  });
});

describe("recommendations", () => {
  const events: PulseEvent[] = buildDemoEvents(now);
  const filters = { date: "any" as const, category: null, confirmedFreeOnly: false };

  it("likes raise matching events and swiped events are excluded", () => {
    const music = events.find((e) => e.id === "demo:d1")!;
    const before = getRecommendations({ events, swipes: [], prefs: emptyPreferences(), filters, now });
    const prefs = applySwipe(emptyPreferences(), music, "like");
    const after = getRecommendations({ events, swipes: [{ eventId: music.id, direction: "like", at: now.toISOString() }], prefs, filters, now });
    expect(after.find((r) => r.event.id === music.id)).toBeUndefined();
    const rank = (list: typeof before, id: string) => list.findIndex((r) => r.event.id === id);
    expect(rank(after, "demo:d8")).toBeLessThanOrEqual(rank(before, "demo:d8"));
    expect(after.find((r) => r.event.id === "demo:d8")!.reason).toMatch(/Because you liked/);
    expect(before.every((r) => r.reason === null)).toBe(true);
  });

  it("filters take precedence over preferences", () => {
    const r = getRecommendations({ events, swipes: [], prefs: emptyPreferences(), filters: { ...filters, confirmedFreeOnly: true }, now });
    expect(r.every((x) => x.event.costAmount === 0)).toBe(true);
  });
});

describe("persistence and plan", () => {
  it("survives reload through the storage adapter", () => {
    const mem = new Map<string, string>();
    const ls = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const s = { ...emptyUserState(), swipes: [{ eventId: "x", direction: "like" as const, at: "t" }] };
    createLocalStorage(ls).save(s);
    expect(createLocalStorage(ls).load().swipes).toHaveLength(1);
  });

  it("orders chronologically and flags overlaps", () => {
    const ev = buildDemoEvents(now);
    const a = ev.find((e) => e.id === "demo:d1")!; // day 0, 19-21
    const b = ev.find((e) => e.id === "demo:d7")!; // day 0, 20-22
    const plan = getPlan([b, a].map((event) => ({ eventId: event.id, addedAt: "", event })));
    expect(plan[0].eventId).toBe(a.id);
    expect(plan[0].overlapsWith).toEqual([b.id]);
  });
});
