import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { normalizeUserState, type UserState } from "@/modules/recommendations/storage";
import { useAuth } from "./AuthProvider";

/**
 * When signed in, the account's saved state replaces the on-device one (or, for a
 * brand-new account, the device state is uploaded). Changes are saved back, debounced.
 */
export function CloudSync() {
  const { user } = useAuth();
  const { state, hydrated, replaceState } = useUserState();
  const loadedFor = useRef<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      loadedFor.current = null;
      return;
    }
    if (loadedFor.current === user.id) return;
    let cancelled = false;
    (async () => {
      const [{ data: row }, { data: profile }] = await Promise.all([
        supabase.from("user_app_state").select("state").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("onboarded_at").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (row?.state) replaceState(normalizeUserState(row.state as unknown as UserState));
      else await supabase.from("user_app_state").upsert({ user_id: user.id, state: state as unknown as Json });
      loadedFor.current = user.id;
      if (!profile?.onboarded_at) navigate({ to: "/onboarding" });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, hydrated]);

  useEffect(() => {
    if (!user || loadedFor.current !== user.id) return;
    const t = setTimeout(() => {
      void supabase.from("user_app_state").upsert({ user_id: user.id, state: state as unknown as Json, updated_at: new Date().toISOString() });
    }, 800);
    return () => clearTimeout(t);
  }, [state, user]);

  return null;
}
