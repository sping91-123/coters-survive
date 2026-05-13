"use client";

import { useEffect, useState } from "react";
import {
  clearSupabaseSession,
  fetchSupabaseProfile,
  fetchSupabaseUser,
  getSupabaseSession,
  refreshSupabaseSession,
  supabaseAuthRefreshEvent,
  type SupabaseProfile,
  type SupabaseSession,
  type SupabaseUser
} from "@/lib/supabase";

const ownerProEmails = (process.env.NEXT_PUBLIC_OWNER_PRO_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const ownerProPlan = process.env.NEXT_PUBLIC_OWNER_PRO_PLAN === "premium" ? "premium" : "admin";

function applyOwnerProPreview(user: SupabaseUser, profile: SupabaseProfile | null) {
  const email = user.email?.trim().toLowerCase();
  if (!email || !ownerProEmails.includes(email)) return profile;

  const now = new Date().toISOString();
  return {
    id: user.id,
    email: user.email ?? profile?.email ?? null,
    display_name: profile?.display_name ?? user.user_metadata?.name ?? user.user_metadata?.full_name ?? null,
    avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
    plan: ownerProPlan,
    created_at: profile?.created_at ?? now,
    updated_at: profile?.updated_at ?? now
  } satisfies SupabaseProfile;
}

export function useSupabaseAuth() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<SupabaseProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadAuth() {
      const baseSession = getSupabaseSession();

      if (!baseSession) {
        if (isMounted) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
        }
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const activeSession =
        baseSession.expiresAt && baseSession.expiresAt <= now
          ? await refreshSupabaseSession(baseSession)
          : baseSession;

      if (!activeSession) {
        if (isMounted) {
          setSession(null);
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) setSession(activeSession);

      return Promise.all([
        fetchSupabaseUser(activeSession.accessToken),
        fetchSupabaseProfile(activeSession.accessToken)
      ]);
    }

    function applyAuthResult(result: Awaited<ReturnType<typeof loadAuth>>) {
        if (!isMounted || !result) return;
        const [nextUser, nextProfile] = result;
        setUser(nextUser);
        setProfile(applyOwnerProPreview(nextUser, nextProfile ?? null));
    }

    function handleAuthError() {
        clearSupabaseSession();
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
    }

    function refreshAuth() {
      setIsLoading(true);
      loadAuth()
        .then(applyAuthResult)
        .catch(handleAuthError)
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    }

    refreshAuth();
    window.addEventListener(supabaseAuthRefreshEvent, refreshAuth);

    return () => {
      isMounted = false;
      window.removeEventListener(supabaseAuthRefreshEvent, refreshAuth);
    };
  }, []);

  function signOut() {
    clearSupabaseSession();
    setSession(null);
    setUser(null);
    setProfile(null);
  }

  return {
    session,
    user,
    profile,
    isLoading,
    signOut
  };
}
