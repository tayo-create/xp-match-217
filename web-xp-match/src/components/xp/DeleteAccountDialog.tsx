import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BACKEND_PATH, readJson } from "@/lib/backend";
import { clearLocalUserData } from "@/lib/persist";
import { fetchWithAuth, useAuth } from "@/providers/AuthProvider";
import { useSync } from "@/providers/SyncProvider";

/** Permanently deletes the account's synced data, directory card, messages and feed posts. */
export function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { signOut } = useAuth();
  const { forgetDevice } = useSync();
  const [confirm, setConfirm] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const ready = confirm.trim().toUpperCase() === "DELETE";

  const run = async () => {
    setBusy(true);
    try {
      await readJson<{ ok: boolean }>(await fetchWithAuth(`${BACKEND_PATH}/account`, { method: "DELETE" }));
      forgetDevice();
      signOut();
      clearLocalUserData();
      toast.success("Your account was deleted");
      window.setTimeout(() => window.location.assign("/"), 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete your account. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[30px] font-semibold text-secondary">Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently erases your synced profile, trips and list, your traveler card, your messages, and every rating, trip and photo you posted to the feed. It can't be undone.
          </DialogDescription>
        </DialogHeader>
        <label className="text-sm font-medium">
          Type DELETE to confirm
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:border-destructive/60" />
        </label>
        <button type="button" onClick={() => void run()} disabled={!ready || busy} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-destructive font-semibold text-destructive-foreground disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Delete forever
        </button>
      </DialogContent>
    </Dialog>
  );
}
