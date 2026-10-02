import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FEED_KEY } from "@/hooks/use-feed";
import { BACKEND_PATH, readJson } from "@/lib/backend";
import type { FeedPost } from "@/lib/feed";
import { firstName } from "@/lib/sharedProfile";
import { cn } from "@/lib/utils";
import { fetchWithAuth } from "@/providers/AuthProvider";

const REASONS = ["Spam or ads", "Inappropriate photo", "Harassment or hate", "Fake or misleading", "Something else"];

/** Report a feed post. It's hidden for you right away, and for everyone after three reports. */
export function ReportDialog({ postId, name, open, onOpenChange }: { postId: string; name: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [detail, setDetail] = useState<string>("");

  const report = useMutation({
    mutationFn: async () =>
      readJson<{ ok: boolean; hidden: boolean }>(
        await fetchWithAuth(`${BACKEND_PATH}/feed/${postId}/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: [reason, detail.trim()].filter(Boolean).join(": ") }),
        }),
      ),
    onSuccess: () => {
      queryClient.setQueryData<{ posts: FeedPost[] }>(FEED_KEY, (prev) => ({ posts: (prev?.posts ?? []).filter((p) => p.id !== postId) }));
      toast.success("Thanks for reporting", { description: "We've hidden it for you and will review it." });
      onOpenChange(false);
      setDetail("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send that report."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[28px] font-semibold text-secondary">Report {firstName(name)}'s post</DialogTitle>
          <DialogDescription>Reports are private. Posts with several reports are hidden until we review them.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r} className={cn("rounded-xl border px-3.5 py-2.5 text-left text-[14px] font-medium", reason === r ? "border-primary bg-accent/60" : "border-border hover:bg-muted")}>
              {r}
            </button>
          ))}
        </div>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} maxLength={240} placeholder="Anything else we should know? (optional)" aria-label="Details" className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
        <button type="button" onClick={() => report.mutate()} disabled={report.isPending} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">
          {report.isPending ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />} Send report
        </button>
      </DialogContent>
    </Dialog>
  );
}
