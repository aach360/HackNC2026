import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Heart, Sparkles, Waves } from "lucide-react";
import { eventsQuery } from "@/modules/ingestion/events.functions";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { getRecommendations } from "@/modules/recommendations/ranking";
import { SwipeDeck } from "@/modules/discovery/SwipeDeck";
import { Filters } from "@/modules/discovery/Filters";
import { EventDetail } from "@/modules/discovery/EventDetail";
import { StatePanel } from "@/components/StatePanel";
import { AeroButton } from "@/components/aero";
import type { EventFilters, PulseEvent } from "@/shared/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PulseMatch — Discover UNC campus events" },
      { name: "description", content: "Swipe through real UNC Chapel Hill events, save favorites, and build your plan." },
      { property: "og:title", content: "PulseMatch — Discover UNC campus events" },
      { property: "og:description", content: "Swipe through real UNC Chapel Hill events, save favorites, and build your plan." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: Discover,
});

const DEFAULT_FILTERS: EventFilters = { date: "any", category: null, confirmedFreeOnly: false };

function Discover() {
  const { data: feed } = useSuspenseQuery(eventsQuery);
  const { state, hydrated, recordSwipe, undoLast } = useUserState();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [detail, setDetail] = useState<PulseEvent | null>(null);

  const categories = useMemo(() => Array.from(new Set(feed.events.flatMap((e) => e.categories))).sort(), [feed.events]);
  const ranked = useMemo(
    () => getRecommendations({ events: feed.events, swipes: state.swipes, prefs: state.prefs, filters }),
    [feed.events, state.swipes, state.prefs, filters],
  );
  const filteredTotal = ranked.length;

  return (
    <div className="space-y-3">
      {feed.origin === "demo" && (
        <div className="aero-panel rounded-2xl px-4 py-2 text-xs font-bold text-navy">
          Showing demo events — live Heel Life events couldn't be loaded right now.
        </div>
      )}
      <Filters value={filters} onChange={setFilters} categories={categories} />

      {!hydrated ? (
        <StatePanel icon={<Waves className="size-6 animate-pulse" />} title="Loading events…" />
      ) : feed.events.length === 0 ? (
        <StatePanel icon={<Waves className="size-6" />} title="No upcoming events">Check back soon.</StatePanel>
      ) : filteredTotal === 0 ? (
        state.swipes.length > 0 && filters === DEFAULT_FILTERS ? (
          <StatePanel tone="grass" icon={<Sparkles className="size-6" />} title="You've seen everything!">
            <p>You swiped through every upcoming event. Check your saved list or come back later.</p>
            <AeroButton className="mt-4" onClick={undoLast}>Undo last swipe</AeroButton>
          </StatePanel>
        ) : (
          <StatePanel icon={<Heart className="size-6" />} title="Nothing matches these filters">
            <p>Heel Life rarely lists ticket prices, so few events are confirmed free.</p>
            <AeroButton tone="pearl" className="mt-4" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</AeroButton>
          </StatePanel>
        )
      ) : (
        <SwipeDeck ranked={ranked} onSwipe={recordSwipe} onUndo={undoLast} canUndo={state.swipes.length > 0} onDetails={setDetail} />
      )}

      <EventDetail event={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
