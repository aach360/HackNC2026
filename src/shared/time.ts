import { DISPLAY_TZ, type DateFilter, type PulseEvent } from "./types";

/** "YYYY-MM-DD" for an instant, in America/New_York. */
export function nyDateKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(key: string, n: number): string {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function weekday(key: string): number {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatEventDate(e: Pick<PulseEvent, "startsAt" | "endsAt">): string {
  const start = new Date(e.startsAt);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const t = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: DISPLAY_TZ,
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  return e.endsAt ? `${day} · ${t(start)} – ${t(new Date(e.endsAt))}` : `${day} · ${t(start)}`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDayHeading(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

/** Does the event occur (start day) within the given relative window? */
export function matchesDateFilter(e: PulseEvent, f: DateFilter, now = new Date()): boolean {
  if (f === "any") return true;
  const today = nyDateKey(now);
  const k = nyDateKey(e.startsAt);
  if (f === "today") return k === today;
  if (f === "tomorrow") return k === addDays(today, 1);
  if (f === "week") return k >= today && k <= addDays(today, 6);
  // weekend: upcoming Sat+Sun (or the current one)
  const wd = weekday(today);
  const sat = wd === 0 ? addDays(today, -1) : addDays(today, (6 - wd + 7) % 7);
  const sun = addDays(sat, 1);
  return k >= sat && k <= sun && k >= today;
}

export function hasEnded(e: PulseEvent, now = new Date()): boolean {
  const end = e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + 60 * 60 * 1000);
  return end.getTime() < now.getTime();
}
