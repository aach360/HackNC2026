/**
 * PulseMatch shared data contract. SINGLE SOURCE OF TRUTH for models.
 * Owned jointly — changes require a heads-up to all four branches (see TEAM.md).
 *
 * Convention: `T | null` means "the source did not tell us" — never invent a value.
 */

export type EventSource = "heellife-json" | "heellife-rss" | "demo" | "submission";

export type EventStatus = "scheduled" | "cancelled" | "unknown";

export interface PulseEvent {
  /** Stable app ID: `${source-family}:${sourceEventId}` e.g. "heellife:12634707". Required. */
  id: string;
  /** Which adapter produced this record. Required. */
  source: EventSource;
  /** ID within the source system. Required. Dedupe key = family(source) + sourceEventId. */
  sourceEventId: string;
  /** Original public event page (registration lives there). Nullable. */
  sourceUrl: string | null;
  title: string;
  /** Plain text, HTML already stripped. Nullable. */
  description: string | null;
  /** ISO 8601 with offset. Required. */
  startsAt: string;
  /** ISO 8601 with offset. Nullable. */
  endsAt: string | null;
  /** IANA zone used for display. Always "America/New_York" for UNC sources. */
  timezone: string;
  location: string | null;
  organizer: string | null;
  imageUrl: string | null;
  /** Coarse, filterable buckets (e.g. "Arts"). */
  categories: string[];
  /** Finer descriptors, lower-case (e.g. "free food", "films, music, & performing arts"). */
  tags: string[];
  /** Admission cost in USD. 0 = confirmed free. null = unknown. */
  costAmount: number | null;
  costText: string | null;
  /** e.g. "UNC students only". Nullable. */
  eligibility: string | null;
  status: EventStatus;
  /** ISO timestamp of the import that produced this record. */
  lastFetchedAt: string;
  /** True only for fixture/demo data. Demo and real events are never mixed in one feed. */
  isDemo: boolean;
  /** Optional AI enrichment (Gemini). Never overrides the facts above. */
  aiSummary?: string | null;
  aiTags?: string[];
}

export type SwipeDirection = "like" | "pass";

export interface Swipe {
  eventId: string;
  direction: SwipeDirection;
  /** ISO timestamp */
  at: string;
}

export interface SavedEvent {
  eventId: string;
  savedAt: string;
  /** Snapshot so Saved/Plan still render if the event drops out of the feed. */
  event: PulseEvent;
}

export interface PlanItem {
  eventId: string;
  addedAt: string;
  event: PulseEvent;
}

export interface UserPreferences {
  /** key = "cat:<category>" | "tag:<tag>", value = learned weight */
  weights: Record<string, number>;
  /** Count of LIKES per key — used only for honest "Because you liked…" explanations. */
  likeCounts: Record<string, number>;
  remindersOptIn: boolean;
}

export type DateFilter = "any" | "today" | "tomorrow" | "weekend" | "week";

export interface EventFilters {
  date: DateFilter;
  category: string | null;
  confirmedFreeOnly: boolean;
}

export interface EventFeed {
  events: PulseEvent[];
  /** Where the events came from. "demo" means real sources failed. */
  origin: EventSource;
  fetchedAt: string;
  warnings: string[];
}

export interface RankedEvent {
  event: PulseEvent;
  score: number;
  /** Only present when backed by real like history. */
  reason: string | null;
}

export const DISPLAY_TZ = "America/New_York";

/* ---------------- Clubs (shared, server-persisted) ---------------- */

export interface Club {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

/** What this device knows about its own membership. Join code is only revealed to members. */
export interface ClubMembership {
  clubId: string;
  memberId: string;
  displayName: string;
  joinCode: string;
}

export type ChatSource = "web" | "imessage";

export interface ClubMessage {
  id: string;
  clubId: string;
  authorName: string;
  body: string;
  source: ChatSource;
  createdAt: string;
  /** True when this device wrote it. */
  mine: boolean;
}
