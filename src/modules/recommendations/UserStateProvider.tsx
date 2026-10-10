import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PulseEvent, SwipeDirection } from "@/shared/types";
import { applySwipe } from "./ranking";
import { createLocalStorage, emptyUserState, type UserState, type UserStateStorage } from "./storage";

interface Ctx {
  state: UserState;
  hydrated: boolean;
  /** recordSwipe(event, direction): like also saves the event. */
  recordSwipe: (event: PulseEvent, dir: SwipeDirection) => void;
  undoLast: () => void;
  removeSaved: (eventId: string) => void;
  togglePlan: (event: PulseEvent) => void;
  setRemindersOptIn: (v: boolean) => void;
  reset: () => void;
}

const UserStateContext = createContext<Ctx | null>(null);

export function UserStateProvider({ children, storage }: { children: ReactNode; storage?: UserStateStorage }) {
  const store = useRef<UserStateStorage | null>(storage ?? null);
  const [state, setState] = useState<UserState>(emptyUserState);
  const [hydrated, setHydrated] = useState(false);
  const history = useRef<UserState[]>([]);

  useEffect(() => {
    store.current ??= createLocalStorage();
    setState(store.current.load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) store.current?.save(state);
  }, [state, hydrated]);

  const update = useCallback((fn: (s: UserState) => UserState) => {
    setState((s) => {
      history.current = [...history.current.slice(-19), s];
      return fn(s);
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      state,
      hydrated,
      recordSwipe: (event, dir) =>
        update((s) => {
          const now = new Date().toISOString();
          return {
            ...s,
            swipes: [...s.swipes.filter((x) => x.eventId !== event.id), { eventId: event.id, direction: dir, at: now }],
            prefs: applySwipe(s.prefs, event, dir),
            saved:
              dir === "like" && !s.saved.some((x) => x.eventId === event.id)
                ? [...s.saved, { eventId: event.id, savedAt: now, event }]
                : s.saved,
          };
        }),
      undoLast: () => {
        const prev = history.current.pop();
        if (prev) setState(prev);
      },
      removeSaved: (id) =>
        update((s) => ({ ...s, saved: s.saved.filter((x) => x.eventId !== id), plan: s.plan.filter((x) => x.eventId !== id) })),
      togglePlan: (event) =>
        update((s) =>
          s.plan.some((p) => p.eventId === event.id)
            ? { ...s, plan: s.plan.filter((p) => p.eventId !== event.id) }
            : { ...s, plan: [...s.plan, { eventId: event.id, addedAt: new Date().toISOString(), event }] },
        ),
      setRemindersOptIn: (v) => update((s) => ({ ...s, prefs: { ...s.prefs, remindersOptIn: v } })),
      reset: () => update(() => emptyUserState()),
    }),
    [state, hydrated, update],
  );

  return <UserStateContext.Provider value={value}>{children}</UserStateContext.Provider>;
}

export function useUserState() {
  const ctx = useContext(UserStateContext);
  if (!ctx) throw new Error("useUserState must be used inside UserStateProvider");
  return ctx;
}
