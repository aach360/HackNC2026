import { Link } from "@tanstack/react-router";
import { Bot, CalendarDays, CalendarRange, Heart, Sparkles, Users } from "lucide-react";
import type { ReactNode } from "react";
import sky from "@/assets/sky-bg.jpg";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { TasteSidebar } from "@/modules/recommendations/TasteSidebar";

const NAV = [
  { to: "/", label: "Discover", icon: Sparkles },
  { to: "/saved", label: "Saved", icon: Heart },
  { to: "/plan", label: "Plan", icon: CalendarDays },
  { to: "/calendar", label: "Calendar", icon: CalendarRange },
  { to: "/clubs", label: "Clubs", icon: Users },
  { to: "/assistant", label: "Assistant", icon: Bot },
] as const;

const BUBBLES = [
  { l: "6%", s: 38, d: "22s", delay: "0s", drift: "30px" },
  { l: "18%", s: 16, d: "15s", delay: "4s", drift: "-20px" },
  { l: "34%", s: 26, d: "19s", delay: "9s", drift: "25px" },
  { l: "58%", s: 14, d: "13s", delay: "2s", drift: "-15px" },
  { l: "72%", s: 44, d: "26s", delay: "6s", drift: "-35px" },
  { l: "88%", s: 20, d: "17s", delay: "11s", drift: "20px" },
];

function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img src={sky} alt="" width={1920} height={1280} className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/20 to-background/40" />
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="bubble"
          style={{ left: b.l, width: b.s, height: b.s, ["--dur" as string]: b.d, ["--delay" as string]: b.delay, ["--drift" as string]: b.drift }}
        />
      ))}
    </div>
  );
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="aero-btn aero-grass inline-flex size-9 items-center justify-center rounded-full font-display text-lg font-black">P</span>
      <span className="font-display text-xl font-bold text-navy">PulseMatch</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useUserState();
  const counts: Record<string, number> = { "/saved": state.saved.length, "/plan": state.plan.length };
  return (
    <div className="relative min-h-dvh">
      <Ambient />
      <header className="aero-panel sticky top-0 z-30 rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <span className="hidden text-xs font-bold text-navy/70 sm:block">UNC Chapel Hill events</span>
          <nav className="hidden gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to !== "/clubs" }}
                className="rounded-full px-4 py-1.5 text-sm font-bold text-navy hover:bg-card"
                activeProps={{ className: "aero-btn aero-aqua" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-28 pt-4 md:grid-cols-[1fr_300px] md:pb-10">
        <main className="min-w-0">{children}</main>
        <aside className="hidden md:block">
          <TasteSidebar />
        </aside>
      </div>

      <nav aria-label="Main" className="aero-panel fixed inset-x-3 bottom-3 z-40 rounded-full md:hidden">
        <ul className="grid grid-cols-5 p-1.5">
          {NAV.map((n) => (
            <li key={n.to}>
              <Link
                to={n.to}
                activeOptions={{ exact: n.to !== "/clubs" }}
                className="relative flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-bold text-navy"
                activeProps={{ className: "aero-btn aero-aqua" }}
              >
                <n.icon className="size-5" aria-hidden />
                {n.label}
                {!!counts[n.to] && (
                  <span className="absolute right-3 top-0.5 rounded-full bg-grass px-1.5 text-[10px] text-grass-foreground">{counts[n.to]}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
