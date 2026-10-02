import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useRef, useState } from "react";

import { BACKEND_PATH, randomId, readJson } from "@/lib/backend";
import { usePersistentState } from "@/lib/persist";
import type { Trip } from "@/lib/types";
import { useProfile } from "@/providers/ProfileProvider";
import { useTrips } from "@/providers/TripsProvider";

export interface ShareRecord {
  tripId: string;
  shareId: string;
  key: string;
  publishedAt: number;
}

/** A visitor of a public link asking to edit. */
export interface AccessRequest {
  userId: string;
  name: string;
  avatar: string;
  note: string;
  status: "pending" | "granted" | "denied";
  at: number;
  roomId?: string;
}

export type AccessOp = "list" | "grant" | "deny" | "revoke" | "forget";

const publish = async (rec: ShareRecord, trip: Trip, owner: string): Promise<{ publishedAt: number; pending: number }> => {
  const res = await fetch(`${BACKEND_PATH}/share/${rec.shareId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: rec.key, trip, owner }),
  });
  const { publishedAt, pending } = await readJson<{ publishedAt: number; pending?: number }>(res);
  return { publishedAt, pending: pending ?? 0 };
};

/** Public, view-only itinerary links. Shared trips republish automatically when they change. */
export const [SharesProvider, useShares] = createContextHook(() => {
  const { trips, tripById } = useTrips();
  const { profile } = useProfile();
  const [shares, setShares] = usePersistentState<ShareRecord[]>("xp.shares.v1", []);
  const published = useRef<Map<string, string>>(new Map());
  const [pendingByTrip, setPendingByTrip] = useState<Record<string, number>>({});

  const shareFor = useCallback((tripId: string | undefined) => shares.find((s) => s.tripId === tripId), [shares]);

  const shareUrl = useCallback((rec: ShareRecord) => `${window.location.origin}/s/${rec.shareId}`, []);

  const enableShare = useCallback(
    async (tripId: string): Promise<ShareRecord> => {
      const trip = tripById(tripId);
      if (!trip) throw new Error("Trip not found");
      const existing = shares.find((s) => s.tripId === tripId);
      const rec: ShareRecord = existing ?? { tripId, shareId: randomId(10), key: randomId(28), publishedAt: 0 };
      const { publishedAt, pending } = await publish(rec, trip, profile.name);
      published.current.set(tripId, JSON.stringify(trip));
      setPendingByTrip((p) => ({ ...p, [tripId]: pending }));
      const next = { ...rec, publishedAt };
      setShares((prev) => [next, ...prev.filter((s) => s.tripId !== tripId)]);
      return next;
    },
    [tripById, shares, profile.name, setShares],
  );

  const disableShare = useCallback(
    async (tripId: string) => {
      const rec = shares.find((s) => s.tripId === tripId);
      if (!rec) return;
      const res = await fetch(`${BACKEND_PATH}/share/${rec.shareId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: rec.key }),
      });
      await readJson<{ ok: boolean }>(res);
      published.current.delete(tripId);
      setShares((prev) => prev.filter((s) => s.tripId !== tripId));
    },
    [shares, setShares],
  );

  // Keep public links current: republish a shared trip a moment after it changes.
  useEffect(() => {
    const timers: number[] = [];
    for (const rec of shares) {
      const trip = trips.find((t) => t.id === rec.tripId);
      if (!trip) continue;
      const str = JSON.stringify(trip);
      if (published.current.get(rec.tripId) === str) continue;
      timers.push(
        window.setTimeout(() => {
          published.current.set(rec.tripId, str);
          publish(rec, trip, profile.name)
            .then(({ pending }) => setPendingByTrip((p) => (p[rec.tripId] === pending ? p : { ...p, [rec.tripId]: pending })))
            .catch((e: unknown) => {
            published.current.delete(rec.tripId);
            console.warn("[share] republish failed", e instanceof Error ? e.message : e);
          });
        }, 2000),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [shares, trips, profile.name]);

  /** Lists or answers edit-access requests for a public link (owner only; uses the link's key). */
  const manageAccess = useCallback(
    async (tripId: string, op: AccessOp, userId?: string, roomId?: string): Promise<AccessRequest[]> => {
      const rec = shares.find((s) => s.tripId === tripId);
      if (!rec) return [];
      const res = await fetch(`${BACKEND_PATH}/share/${rec.shareId}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: rec.key, op, userId, roomId }),
      });
      const { requests } = await readJson<{ requests: AccessRequest[] }>(res);
      setPendingByTrip((p) => ({ ...p, [tripId]: requests.filter((r) => r.status === "pending").length }));
      return requests;
    },
    [shares],
  );

  const pendingFor = useCallback((tripId: string | undefined) => (tripId ? (pendingByTrip[tripId] ?? 0) : 0), [pendingByTrip]);

  return { shares, shareFor, shareUrl, enableShare, disableShare, manageAccess, pendingFor };
});
