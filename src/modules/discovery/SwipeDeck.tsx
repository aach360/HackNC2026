import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Heart, X, Undo2 } from "lucide-react";
import type { PulseEvent, RankedEvent, SwipeDirection } from "@/shared/types";
import { OrbButton } from "@/components/aero";
import { EventCard } from "./EventCard";

const THRESHOLD = 110;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SwipeDeck({
  ranked,
  onSwipe,
  onUndo,
  canUndo,
  onDetails,
  returning,
  onReturned,
}: {
  ranked: RankedEvent[];
  onSwipe: (e: PulseEvent, d: SwipeDirection) => void;
  onUndo: () => void;
  canUndo: boolean;
  onDetails: (e: PulseEvent) => void;
  /** Card restored by undo: slides back in from the side it left. */
  returning?: { id: string; dir: SwipeDirection } | null;
  onReturned?: () => void;
}) {
  const top = ranked[0];
  const next = ranked[1];
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [entering, setEntering] = useState(false);

  // Undo: place the restored card off-screen on the side it left, then animate it back to centre.
  useLayoutEffect(() => {
    if (!returning || !top || top.event.id !== returning.id) return;
    setLeaving(null);
    if (prefersReducedMotion()) { setDx(0); onReturned?.(); return; }
    setEntering(true);
    setDx(returning.dir === "like" ? 700 : -700);
    // Two frames so the off-screen position paints before transitioning back; clear `returning` only after.
    requestAnimationFrame(() => requestAnimationFrame(() => { setEntering(false); setDx(0); onReturned?.(); }));
  }, [returning, top, onReturned]);

  const commit = useCallback(
    (dir: SwipeDirection) => {
      if (!top || leaving) return;
      if (prefersReducedMotion()) {
        onSwipe(top.event, dir);
        setDx(0);
        return;
      }
      setLeaving(dir);
      setTimeout(() => {
        onSwipe(top.event, dir);
        setLeaving(null);
        setDx(0);
      }, 260);
    },
    [top, leaving, onSwipe],
  );

  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest("input, textarea, [role=dialog]")) return;
      if (ev.key === "ArrowRight") commit("like");
      else if (ev.key === "ArrowLeft") commit("pass");
      else if (ev.key === "Enter" && top && t === document.body) onDetails(top.event);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [commit, onDetails, top]);

  if (!top) return null;

  const x = leaving ? (leaving === "like" ? 700 : -700) : dx;
  const rot = x / 18;
  const likeOpacity = Math.min(1, Math.max(0, x / THRESHOLD));
  const passOpacity = Math.min(1, Math.max(0, -x / THRESHOLD));

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[min(calc(100dvh_-_330px),600px)] min-h-[380px] w-full max-w-sm" aria-live="polite">
        {next && (
          <div key={next.event.id} className="absolute inset-0 scale-[0.95] opacity-80 transition-transform duration-300" aria-hidden>
            <EventCard ranked={next} onDetails={() => {}} />
          </div>
        )}
        <div
          key={top.event.id}
          role="group"
          aria-label={`${top.event.title}. Right arrow to save, left arrow to pass.`}
          className="animate-pop absolute inset-0 touch-pan-y cursor-grab active:cursor-grabbing"
          style={{
            transform: `translateX(${x}px) rotate(${rot}deg)`,
            transition: dragging || entering ? "none" : "transform 260ms cubic-bezier(.2,.8,.3,1)",
          }}
          onPointerDown={(e) => {
            start.current = { x: e.clientX, y: e.clientY };
            setDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current && setDx(e.clientX - start.current.x)}
          onPointerUp={() => {
            setDragging(false);
            start.current = null;
            if (dx > THRESHOLD) commit("like");
            else if (dx < -THRESHOLD) commit("pass");
            else setDx(0);
          }}
          onPointerCancel={() => {
            setDragging(false);
            start.current = null;
            setDx(0);
          }}
        >
          <EventCard ranked={top} onDetails={() => onDetails(top.event)} />
          <span style={{ opacity: likeOpacity }} className="aero-btn aero-grass pointer-events-none absolute left-6 top-10 -rotate-12 rounded-2xl px-4 py-2 text-2xl font-black">SAVE</span>
          <span style={{ opacity: passOpacity }} className="aero-btn aero-rose pointer-events-none absolute right-6 top-10 rotate-12 rounded-2xl px-4 py-2 text-2xl font-black">PASS</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <OrbButton tone="rose" className="size-16" aria-label="Pass (left arrow)" onClick={() => commit("pass")}>
          <X className="size-8" strokeWidth={3} />
        </OrbButton>
        <OrbButton tone="pearl" className="size-11" aria-label="Undo last swipe" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="size-5" />
        </OrbButton>
        <OrbButton tone="grass" className="size-16" aria-label="Save (right arrow)" onClick={() => commit("like")}>
          <Heart className="size-8" strokeWidth={3} fill="currentColor" />
        </OrbButton>
      </div>
      <p className="mt-3 hidden text-xs font-bold text-navy/70 md:block">← pass · → save · tap Details for more</p>
    </div>
  );
}
