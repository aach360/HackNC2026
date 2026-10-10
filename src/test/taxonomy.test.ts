import { describe, expect, it } from "vitest";
import type { PulseEvent } from "@/shared/types";
import { TAXONOMY_VERSION, TOPICS, canonicalTopic } from "@/shared/taxonomy";
import { classifyEvent, validateAiTopic, withClassification } from "@/modules/recommendations/classify";
import { featureKeys, keyLabel } from "@/modules/recommendations/ranking";
import { rankHybrid } from "@/modules/recommendations/engine";
import { emptyPreferences } from "@/modules/recommendations/ranking";
import { normalizeUserState, emptyUserState } from "@/modules/recommendations/storage";

const now = new Date("2026-10-12T14:00:00Z");

function ev(id: string, title: string, extra: Partial<PulseEvent> = {}): PulseEvent {
  return {
    id, source: "unc-calendar", sourceEventId: id, sourceOccurrenceId: null, sourceUrl: null, title, description: null,
    startsAt: new Date(now.getTime() + 30 * 3_600_000).toISOString(), endsAt: null, allDay: false, timezone: "America/New_York",
    location: null, organizer: null, hosts: [], imageUrl: null, categories: [], tags: [], costAmount: null, costText: null,
    eligibility: null, status: "scheduled", sourceStatus: null, lastFetchedAt: now.toISOString(), isDemo: false, ...extra,
  } as PulseEvent;
}

describe("taxonomy classification", () => {
  it("normalizes synonyms to canonical topic ids", () => {
    expect(canonicalTopic("football")).toBe("sports");
    expect(canonicalTopic("jazz")).toBe("music");
    expect(canonicalTopic("not-a-topic")).toBeNull();
    expect(TOPICS.length).toBeGreaterThanOrEqual(20);
  });

  it("classifies from content and records evidence", () => {
    const c = classifyEvent(ev("1", "Jazz Ensemble Concert", { description: "Live music in Memorial Hall." }));
    expect(c.topics).toContain("music");
    expect(c.evidence.music).toBeTruthy();
    expect(c.version).toBe(TAXONOMY_VERSION);
  });

  it("rejects tags that are not supported by the text", () => {
    // Source claims a topic but nothing in title/description supports it.
    const c = classifyEvent(ev("1", "Monthly department meeting", { tags: ["basketball", "concert"] }));
    expect(c.topics).not.toContain("sports");
    expect(c.topics).not.toContain("music");
  });

  it("treats an empty topic set as valid instead of inventing topics", () => {
    const c = classifyEvent(ev("1", "Building closed for maintenance"));
    expect(c.topics).toEqual([]);
  });

  it("does not let vague source categories drive features", () => {
    const e = withClassification(ev("1", "General body meeting", { categories: ["Student Life"] }));
    const keys = featureKeys(e);
    expect(keys.filter((k) => k.startsWith("cat:")).length).toBeLessThanOrEqual(1);
    expect(keyLabel("topic:music")).toBe("Music");
  });

  it("validates AI-claimed topics against visible evidence", () => {
    const e = ev("1", "Coding workshop for beginners");
    expect(validateAiTopic("tech", "Coding workshop", e)).toBe("tech");
    expect(validateAiTopic("sports", "nothing about sports here", e)).toBeNull();
  });
});

describe("cold-start interests prior", () => {
  it("ranks interest-matching events higher before any swipes", () => {
    const music = withClassification(ev("m", "Jazz night on the quad"));
    const other = withClassification(ev("o", "Graduate thesis defense"));
    const prefs = { ...emptyPreferences(), onboarding: { interests: ["music"], completedAt: now.toISOString() } };
    const ranked = rankHybrid({ events: [other, music], swipes: [], prefs, filters: { date: "any", category: null, confirmedFreeOnly: false }, vectors: {}, now });
    expect(ranked[0].event.id).toBe("m");
    expect(ranked[0].breakdown?.reasons).toContain("Matches the interests you picked");
  });

  it("stores the prior in weights without fabricating swipes", () => {
    const s = emptyUserState();
    const withPrior = normalizeUserState({
      ...s,
      prefs: { ...s.prefs, weights: { "topic:music": 1.5 }, onboarding: { interests: ["music"] } },
    });
    expect(withPrior.prefs.weights["topic:music"]).toBe(1.5);
    expect(withPrior.swipes).toEqual([]);
    expect(withPrior.prefs.onboarding?.interests).toEqual(["music"]);
  });
});

describe("account persistence boundaries", () => {
  it("keeps onboarding data through normalize round-trips (jsonb shape)", () => {
    const s = normalizeUserState({
      ...emptyUserState(),
      prefs: { ...emptyUserState().prefs, onboarding: { intent: "hobbies", interests: ["art"], major: "CS", year: "Junior" } },
    });
    expect(s.prefs.onboarding?.major).toBe("CS");
  });
});
