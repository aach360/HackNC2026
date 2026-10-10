import type { PulseEvent } from "@/shared/types";
import { htmlToText, decodeEntities } from "./sanitize";

/**
 * Source adapter interface. Add a new campus site by implementing this and
 * registering it in importer.ts. Adapters MUST return normalized events and
 * use null for unknown facts.
 */
export interface SourceAdapter {
  name: PulseEvent["source"];
  fetchEvents(opts: { now: Date; fetchedAt: string }): Promise<PulseEvent[]>;
}

const TIMEOUT_MS = 8000;
const UA = "PulseMatch/0.1 (UNC hackathon project)";

async function boundedFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": UA, accept: "application/json, application/rss+xml, */*" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res;
}

const THEME_LABELS: Record<string, string> = {
  Arts: "Arts",
  Athletics: "Athletics",
  CommunityService: "Service",
  Cultural: "Cultural",
  Fundraising: "Fundraising",
  GroupBusiness: "Org Business",
  Social: "Social",
  Spirituality: "Spirituality",
  ThoughtfulLearning: "Learning",
};

export const themeToCategory = (t: string | null | undefined) =>
  t ? (THEME_LABELS[t] ?? t) : null;

function cleanTag(s: string) {
  return decodeEntities(s).replace(/\s+/g, " ").trim().toLowerCase();
}

/* ---------------- Heel Life JSON (undocumented — keep isolated) ---------------- */

interface HeelLifeJsonEvent {
  id: string;
  name: string;
  description?: string | null;
  location?: string | null;
  startsOn: string;
  endsOn?: string | null;
  imagePath?: string | null;
  organizationName?: string | null;
  theme?: string | null;
  categoryNames?: string[] | null;
  benefitNames?: string[] | null;
  status?: string | null;
  visibility?: string | null;
}

export function mapHeelLifeJson(e: HeelLifeJsonEvent, fetchedAt: string): PulseEvent {
  const cat = themeToCategory(e.theme);
  const tags = [...(e.categoryNames ?? []), ...(e.benefitNames ?? [])].map(cleanTag).filter(Boolean);
  return {
    id: `heellife:${e.id}`,
    source: "heellife-json",
    sourceEventId: String(e.id),
    sourceUrl: `https://heellife.unc.edu/event/${e.id}`,
    title: decodeEntities(e.name).trim(),
    description: htmlToText(e.description),
    startsAt: e.startsOn,
    endsAt: e.endsOn ?? null,
    timezone: "America/New_York",
    location: e.location?.trim() || null,
    organizer: e.organizationName?.trim() || null,
    imageUrl: e.imagePath ? `https://se-images.campuslabs.com/clink/images/${e.imagePath}?preset=med-w` : null,
    categories: cat ? [cat] : [],
    tags: Array.from(new Set(tags)),
    // Heel Life does not publish admission cost. "Free Food" is a benefit, not free admission.
    costAmount: null,
    costText: null,
    eligibility: null,
    status: e.status === "Approved" ? "scheduled" : "unknown",
    lastFetchedAt: fetchedAt,
    isDemo: false,
  };
}

export const heelLifeJsonAdapter: SourceAdapter = {
  name: "heellife-json",
  async fetchEvents({ now, fetchedAt }) {
    const PAGE = 50;
    const MAX_PAGES = 3; // conservative
    const out: PulseEvent[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `https://heellife.unc.edu/api/discovery/event/search?take=${PAGE}&skip=${page * PAGE}` +
        `&endsAfter=${encodeURIComponent(now.toISOString())}&orderByField=endsOn&orderByDirection=ascending&status=Approved`;
      const json = (await (await boundedFetch(url)).json()) as { value?: HeelLifeJsonEvent[] };
      if (!Array.isArray(json.value)) throw new Error("Unexpected JSON shape: missing value[]");
      for (const e of json.value) {
        if (e.visibility && e.visibility !== "Public") continue;
        if (!e.id || !e.name || !e.startsOn) continue;
        out.push(mapHeelLifeJson(e, fetchedAt));
      }
      if (json.value.length < PAGE) break;
    }
    return out;
  },
};

/* ---------------- Heel Life RSS (fallback) ---------------- */

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return null;
  return (m[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
}

function allTags(block: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi");
  return Array.from(block.matchAll(re), (m) => (m[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
}

export function parseHeelLifeRss(xml: string, fetchedAt: string): PulseEvent[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: PulseEvent[] = [];
  for (const item of items) {
    const link = tag(item, "link");
    const id = link?.match(/event\/(\d+)/)?.[1];
    const title = tag(item, "title");
    const start = tag(item, "start");
    if (!id || !title || !start) continue;
    const end = tag(item, "end");
    const descHtml = tag(item, "description") ?? "";
    const inner = descHtml.match(/class="p-description description">([\s\S]*?)<\/div>\s*<div>/)?.[1] ?? null;
    const cats = allTags(item, "category").map((c) => decodeEntities(c).trim());
    const theme = cats[0] ?? null;
    const hosts = allTags(item, "host");
    const image = item.match(/<enclosure[^>]*url="([^"]+)"/)?.[1] ?? null;
    out.push({
      id: `heellife:${id}`,
      source: "heellife-rss",
      sourceEventId: id,
      sourceUrl: link,
      title: decodeEntities(title),
      description: htmlToText(inner),
      startsAt: new Date(start).toISOString(),
      endsAt: end ? new Date(end).toISOString() : null,
      timezone: "America/New_York",
      location: tag(item, "location") ? decodeEntities(tag(item, "location")!) : null,
      organizer: hosts.length ? decodeEntities(hosts[hosts.length - 1] ?? "") : null,
      imageUrl: image ? decodeEntities(image) : null,
      categories: theme ? [themeToCategory(theme)!] : [],
      tags: Array.from(new Set(cats.slice(1).map(cleanTag).filter(Boolean))),
      costAmount: null,
      costText: null,
      eligibility: null,
      status: tag(item, "status") === "cancelled" ? "cancelled" : "scheduled",
      lastFetchedAt: fetchedAt,
      isDemo: false,
    });
  }
  return out;
}

export const heelLifeRssAdapter: SourceAdapter = {
  name: "heellife-rss",
  async fetchEvents({ fetchedAt }) {
    const xml = await (await boundedFetch("https://heellife.unc.edu/events.rss")).text();
    const events = parseHeelLifeRss(xml, fetchedAt);
    if (!events.length) throw new Error("RSS returned no parseable items");
    return events;
  },
};
