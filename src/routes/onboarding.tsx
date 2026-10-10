import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { PulseEvent, RankedEvent } from "@/shared/types";
import { eventsQuery } from "@/modules/ingestion/events.functions";
import { SwipeDeck } from "@/modules/discovery/SwipeDeck";
import { EventDetail } from "@/modules/discovery/EventDetail";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { useAuth } from "@/modules/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { AeroButton, PageTitle, Panel } from "@/components/aero";
import { StatePanel } from "@/components/StatePanel";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Pick your vibe — PulseMatch" },
      { name: "description", content: "Swipe five UNC events to teach PulseMatch what you're into." },
      { property: "og:title", content: "Pick your vibe — PulseMatch" },
      { property: "og:description", content: "Five swipes to tune your UNC event feed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

const COUNT = 5;

/** Five upcoming events from as many different categories as possible. */
function pickDiverse(events: PulseEvent[], skip: Set<string>): PulseEvent[] {
  const seen = new Set<string>();
  const out: PulseEvent[] = [];
  const pool = events.filter((e) => !skip.has(e.id));
  for (const e of pool) {
    const k = (e.tags[0] ?? e.source ?? "other").toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(e); }
    if (out.length === COUNT) return out;
  }
  for (const e of pool) { if (out.length === COUNT) break; if (!out.includes(e)) out.push(e); }
  return out;
}

function Onboarding() {
  const feed = useQuery(eventsQuery);
  const { state, recordSwipe, undoLast } = useUserState();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PulseEvent | null>(null);
  const cards = useRef<PulseEvent[] | null>(null);
  if (!cards.current && feed.data) cards.current = pickDiverse(feed.data.events, new Set(state.swipes.map((s) => s.eventId)));

  const swiped = new Set(state.swipes.map((s) => s.eventId));
  const remaining: RankedEvent[] = useMemo(
    () => (cards.current ?? []).filter((e) => !swiped.has(e.id)).map((event) => ({ event, score: 0, reason: null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.swipes, feed.data],
  );
  const done = (cards.current?.length ?? 0) - remaining.length;

  async function finish() {
    if (user) await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);
    navigate({ to: "/" });
  }

  if (feed.isLoading) return <StatePanel icon={<Loader2 className="size-6 animate-spin" />} title="Finding events…" />;
  if (!cards.current?.length) return <StatePanel icon={<Sparkles className="size-6" />} title="No events to show yet" />;

  return (
    <div className="space-y-4">
      <PageTitle title="Pick your vibe" subtitle="Swipe right on what sounds fun, left on what doesn't. Five cards tune your feed." />
      <div className="flex justify-center gap-2" aria-label={`${done} of ${cards.current.length} done`}>
        {cards.current.map((e, i) => (
          <span key={e.id} className={i < done ? "size-3 rounded-full bg-primary" : "size-3 rounded-full bg-card"} />
        ))}
      </div>
      {remaining.length ? (
        <SwipeDeck ranked={remaining} onSwipe={(e, d) => recordSwipe(e, d)} onUndo={undoLast} canUndo={done > 0} onDetails={setDetail} />
      ) : (
        <Panel className="space-y-3 p-6 text-center">
          <h2 className="font-display text-xl font-extrabold text-navy">You're all set</h2>
          <p className="text-sm text-muted-foreground">Your feed now leans toward what you liked. It keeps learning with every swipe.</p>
          <AeroButton tone="grass" onClick={finish}>Start discovering</AeroButton>
        </Panel>
      )}
      {remaining.length > 0 && (
        <button type="button" onClick={finish} className="mx-auto block text-sm font-bold text-muted-foreground underline">Skip for now</button>
      )}
      {detail && <EventDetail event={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
