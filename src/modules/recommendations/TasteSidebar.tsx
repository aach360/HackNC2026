import { Droplets, RotateCcw } from "lucide-react";
import { Panel, OrbIcon, AeroButton } from "@/components/aero";
import { useUserState } from "./UserStateProvider";
import { keyLabel } from "./ranking";

/** Makes recommendation changes visible during a demo. */
export function TasteSidebar() {
  const { state, reset } = useUserState();
  const entries = Object.entries(state.prefs.weights)
    .filter(([, w]) => w !== 0)
    .sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 8);
  const max = Math.max(1, ...top.map(([, w]) => Math.abs(w)));
  const likes = state.swipes.filter((s) => s.direction === "like").length;
  return (
    <Panel className="sticky top-20 p-5">
      <div className="flex items-center gap-3">
        <OrbIcon tone="grass"><Droplets className="size-4" /></OrbIcon>
        <div>
          <h2 className="text-base font-bold text-navy">Your taste</h2>
          <p className="text-xs font-semibold text-muted-foreground">
            {state.swipes.length} swipes · {likes} saved
          </p>
        </div>
      </div>
      {top.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Swipe a few events and you'll see what PulseMatch learns about you here.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {top.map(([k, w]) => (
            <li key={k} className="text-xs">
              <div className="flex justify-between font-semibold text-navy">
                <span className="truncate capitalize">{keyLabel(k)}</span>
                <span className={w > 0 ? "text-grass" : "text-destructive"}>{w > 0 ? "+" : ""}{w.toFixed(1)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${w > 0 ? "aero-grass" : "aero-rose"}`} style={{ width: `${(Math.abs(w) / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.swipes.length > 0 && (
        <AeroButton tone="pearl" className="mt-5 w-full" onClick={() => confirm("Reset swipes, saved events and plan?") && reset()}>
          <RotateCcw className="size-4" /> Start over
        </AeroButton>
      )}
    </Panel>
  );
}
