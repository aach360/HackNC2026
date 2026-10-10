import { CalendarDays, MapPin, Users, Info } from "lucide-react";
import type { RankedEvent } from "@/shared/types";
import { formatEventDate } from "@/shared/time";
import { topicLabel } from "@/shared/taxonomy";
import { Chip } from "@/components/aero";
import { EventImage } from "./EventImage";

export function EventCard({ ranked, onDetails }: { ranked: RankedEvent; onDetails: () => void }) {
  const e = ranked.event;
  return (
    <article className="aero-panel flex h-full flex-col overflow-hidden rounded-[2rem] p-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[1.6rem]">
        <EventImage event={e} eager />
        <div className="gloss absolute inset-0 rounded-[1.6rem]" />
        {ranked.reason && (
          <span className="aero-btn aero-grass absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold">{ranked.reason}</span>
        )}
        {e.isDemo && <span className="absolute right-3 top-3 rounded-full bg-navy px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-navy-foreground">Demo</span>}
      </div>
      <div className="aero-solid mt-2 rounded-[1.6rem] p-4">
        <h2 className="line-clamp-2 text-xl font-bold leading-tight text-navy">{e.title}</h2>
        <ul className="mt-2 space-y-1 text-sm font-semibold text-foreground/80">
          <li className="flex items-center gap-2"><CalendarDays className="size-4 shrink-0 text-primary" />{formatEventDate(e)}</li>
          {e.location && <li className="flex items-center gap-2"><MapPin className="size-4 shrink-0 text-primary" /><span className="truncate">{e.location}</span></li>}
          {e.organizer && <li className="flex items-center gap-2"><Users className="size-4 shrink-0 text-primary" /><span className="truncate">{e.organizer}</span></li>}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(e.topics ?? []).slice(0, 3).map((t) => <Chip key={t} className="border-primary/40 bg-primary/10">{topicLabel(t)}</Chip>)}
          {e.categories.map((c) => <Chip key={c}>{c}</Chip>)}
          {e.tags.includes("free food") && <Chip className="border-grass/40 bg-grass/15">free food</Chip>}
          {e.costText && <Chip className="border-grass/40 bg-grass/15">{e.costText}</Chip>}
          <button
            type="button"
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={onDetails}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-primary hover:bg-secondary"
          >
            <Info className="size-4" /> Details
          </button>
        </div>
        {ranked.breakdown && (
          <details className="mt-2 text-xs" onPointerDown={(ev) => ev.stopPropagation()}>
            <summary className="cursor-pointer font-bold text-primary">Why this event?</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground/80">
              {ranked.breakdown.reasons.length ? ranked.breakdown.reasons.map((r) => <li key={r}>{r}</li>) : <li>Not enough swipes yet — ordered by timing and variety.</li>}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}
