import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useMemo } from "react";

import { DEFAULT_PROFILE } from "@/data/seed";
import { STORAGE_KEYS, usePersistentState } from "@/lib/persist";
import type { StyleDials, TasteProfile } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

export const [ProfileProvider, useProfile] = createContextHook(() => {
  const [stored, setStored] = usePersistentState<TasteProfile | null>("xp.profile.v1", null);
  const [skipped, setSkipped] = usePersistentState<boolean>("xp.skipped.v1", false);

  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "";
  const profile: TasteProfile = useMemo(() => stored ?? { ...DEFAULT_PROFILE, name: firstName || DEFAULT_PROFILE.name }, [stored, firstName]);
  const hasProfile = stored !== null;
  const needsOnboarding = !hasProfile && !skipped;

  const saveProfile = useCallback(
    (p: TasteProfile) => {
      setStored(p);
      setSkipped(false);
    },
    [setStored, setSkipped],
  );

  /** Saves answers from the standalone style round without retaking the whole quiz. */
  const saveDials = useCallback(
    (dials: StyleDials) => setStored((prev) => ({ ...(prev ?? DEFAULT_PROFILE), dials, dialsSource: "quiz" })),
    [setStored],
  );

  const skip = useCallback(() => setSkipped(true), [setSkipped]);

  const resetAll = useCallback(() => {
    STORAGE_KEYS.forEach((k) => window.localStorage.removeItem(k));
    window.location.assign("/welcome");
  }, []);

  return { profile, hasProfile, needsOnboarding, skipped, saveProfile, saveDials, skip, resetAll };
});
