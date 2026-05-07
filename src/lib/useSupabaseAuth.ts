"use client";

import { useEffect, useState } from "react";
import {
  clearSupabaseSession,
  fetchSupabaseProfile,
  fetchSupabaseUser,
  getSupabaseSession,
  refreshSupabaseSession,
  type SupabaseProfile,
  type SupabaseSession,
  type SupabaseUser
} from "@/lib/supabase";

export function useSupabaseAuth() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<SupabaseProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const storedSession = getSupabaseSession();

    if (!storedSession) {
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const baseSession = storedSession;

    async function loadAuth() {
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

    loadAuth()
      .then((result) => {
        if (!isMounted || !result) return;
        const [nextUser, nextProfile] = result;
        setUser(nextUser);
        setProfile(nextProfile ?? null);
      })
      .catch(() => {
        clearSupabaseSession();
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
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
