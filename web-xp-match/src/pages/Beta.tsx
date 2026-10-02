import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, Check, Flag, Lightbulb, Loader2, MessageSquareHeart, RotateCcw, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { SignInPrompt } from "@/components/xp/SignInPrompt";
import { BACKEND_PATH, readJson } from "@/lib/backend";
import { APP_VERSION } from "@/lib/beta";
import { relTime } from "@/lib/feed";
import { cn } from "@/lib/utils";
import { fetchWithAuth, useAuth } from "@/providers/AuthProvider";

type Kind = "bug" | "idea" | "other" | "crash" | "report";

interface Entry {
  id: string;
  kind: Kind;
  message: string;
  page: string;
  version: string;
  ua: string;
  viewport: string;
  userId: string;
  name: string;
  email: string;
  context?: Record<string, unknown>;
  count: number;
  postId?: string;
  resolved: boolean;
  createdAt: number;
  lastSeenAt: number;
}

const KIND_META: Record<Kind, { label: string; icon: typeof Bug; color: string }> = {
  bug: { label: "Bug", icon: Bug, color: "#C8452D" },
  idea: { label: "Idea", icon: Lightbulb, color: "#C98A1B" },
  other: { label: "Note", icon: MessageSquareHeart, color: "#1F2A44" },
  crash: { label: "Crash", icon: TriangleAlert, color: "#9B2C1C" },
  report: { label: "Reported post", icon: Flag, color: "#5E4B8B" },
};

type Tab = "open" | Kind | "resolved";

const browserOf = (ua: string): string => {
  const m = /(Edg|Chrome|Firefox|Safari)\/(\d+)/.exec(ua);
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "";
  const name = m ? (m[1] === "Edg" ? "Edge" : m[1]) : "Browser";
  return [name, os].filter(Boolean).join(" · ");
};

/** Beta admin dashboard: tester feedback, crash reports and reported feed posts in one inbox. */
export default function Beta() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("open");

  const me = useQuery({
    queryKey: ["beta-me", user?.id],
    queryFn: async () => readJson<{ admin: boolean; claimable: boolean }>(await fetchWithAuth(`${BACKEND_PATH}/beta/me`)),
    enabled: Boolean(user),
  });

  const feed = useQuery({
    queryKey: ["beta-feedback"],
    queryFn: async () => readJson<{ entries: Entry[] }>(await fetchWithAuth(`${BACKEND_PATH}/beta/feedback`)),
    enabled: Boolean(me.data?.admin),
    refetchInterval: 30_000,
    select: (d) => d.entries,
  });

  const claim = useMutation({
    mutationFn: async () => readJson<{ admin: boolean }>(await fetchWithAuth(`${BACKEND_PATH}/beta/claim`, { method: "POST" })),
    onSuccess: () => {
      toast.success("You're the beta admin");
      void queryClient.invalidateQueries({ queryKey: ["beta-me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't claim the dashboard."),
  });

  const act = useMutation({
    mutationFn: async ({ path, method }: { path: string; method: "POST" | "DELETE" }) => readJson<unknown>(await fetchWithAuth(`${BACKEND_PATH}${path}`, { method })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["beta-feedback"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "That didn't work."),
  });

  const entries = useMemo(() => feed.data ?? [], [feed.data]);
  const counts = useMemo(() => {
    const open = entries.filter((e) => !e.resolved);
    return {
      open: open.length,
      bug: open.filter((e) => e.kind === "bug").length,
      idea: open.filter((e) => e.kind === "idea").length,
      crash: open.filter((e) => e.kind === "crash").length,
      report: open.filter((e) => e.kind === "report").length,
      other: open.filter((e) => e.kind === "other").length,
      resolved: entries.length - open.length,
      testers: new Set(entries.filter((e) => e.kind !== "crash").map((e) => e.userId || e.email || e.name)).size,
    };
  }, [entries]);

  const shown = useMemo(() => {
    if (tab === "resolved") return entries.filter((e) => e.resolved);
    if (tab === "open") return entries.filter((e) => !e.resolved);
    return entries.filter((e) => !e.resolved && e.kind === tab);
  }, [entries, tab]);

  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <SignInPrompt title="Beta dashboard" body="Sign in to read tester feedback, crash reports and reported posts." />
      </div>
    );
  }

  if (me.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!me.data?.admin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="surface p-8 text-center">
          <ShieldCheck className="mx-auto size-9 text-primary" />
          <h1 className="mt-4 font-display text-[34px] font-semibold text-secondary">Beta dashboard</h1>
          {me.data?.claimable ? (
            <>
              <p className="mx-auto mt-2 max-w-sm text-foreground/75">No one runs this beta yet. Claim it to become the only admin: you'll see every piece of feedback and moderate reported posts.</p>
              <button type="button" onClick={() => claim.mutate()} disabled={claim.isPending} className="press mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-60">
                {claim.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Claim admin access
              </button>
            </>
          ) : (
            <p className="mx-auto mt-2 max-w-sm text-foreground/75">This dashboard is only for the XP Match team. Thanks for testing! Use "Send feedback" in the menu to reach us.</p>
          )}
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; n: number }[] = [
    { id: "open", label: "All open", n: counts.open },
    { id: "bug", label: "Bugs", n: counts.bug },
    { id: "crash", label: "Crashes", n: counts.crash },
    { id: "report", label: "Reports", n: counts.report },
    { id: "idea", label: "Ideas", n: counts.idea },
    { id: "other", label: "Notes", n: counts.other },
    { id: "resolved", label: "Resolved", n: counts.resolved },
  ];

  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-16 pt-7 sm:px-8">
      <p className="eyebrow">Beta · {APP_VERSION}</p>
      <h1 className="mt-2 text-[48px] font-semibold leading-none text-secondary">Tester inbox</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open items" value={counts.open} />
        <Stat label="Testers heard from" value={counts.testers} />
        <Stat label="Crash types" value={counts.crash} tone={counts.crash ? "#9B2C1C" : undefined} />
        <Stat label="Posts to review" value={counts.report} tone={counts.report ? "#5E4B8B" : undefined} />
      </div>

      <div className="mt-6 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id} className={cn("rounded-full border px-3.5 py-1.5 text-sm", tab === t.id ? "border-secondary bg-secondary text-secondary-foreground" : "border-border hover:bg-muted")}>
            {t.label} <span className="ml-1 tabular-nums opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {feed.isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : feed.error ? (
          <p className="surface p-6 text-center text-muted-foreground">{feed.error instanceof Error ? feed.error.message : "Couldn't load feedback."}</p>
        ) : !shown.length ? (
          <div className="surface p-10 text-center text-muted-foreground">
            <Check className="mx-auto size-7 text-[#3F8A63]" />
            <p className="mt-2">Nothing here. Inbox zero.</p>
          </div>
        ) : (
          shown.map((e) => {
            const meta = KIND_META[e.kind];
            const [first, ...rest] = e.message.split("\n");
            return (
              <article key={e.id} className={cn("surface p-4", e.resolved && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: meta.color }}>
                    <meta.icon className="size-3.5" /> {meta.label}
                  </span>
                  {e.count > 1 ? <span className="font-semibold text-foreground">×{e.count}</span> : null}
                  <span>{relTime(e.lastSeenAt)}</span>
                  {e.name || e.email ? <span>· {[e.name, e.email].filter(Boolean).join(" · ")}</span> : null}
                  {e.page ? <span className="font-mono">· {e.page}</span> : null}
                  {e.ua ? <span>· {browserOf(e.ua)}</span> : null}
                  {e.viewport ? <span>· {e.viewport}</span> : null}
                  {e.version ? <span>· v{e.version}</span> : null}
                </div>
                <p className={cn("mt-2 whitespace-pre-wrap text-[15px]", e.kind === "crash" && "font-mono text-[13px] font-semibold")}>{first}</p>
                {rest.length ? (
                  e.kind === "crash" ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[12.5px] font-semibold text-primary">Stack trace</summary>
                      <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-muted p-3 text-[11.5px] leading-relaxed">{rest.join("\n")}</pre>
                    </details>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-[14px] text-foreground/80">{rest.join("\n")}</p>
                  )
                ) : null}
                {e.kind === "report" && e.context?.hidden ? <p className="mt-2 text-[12.5px] font-semibold text-[#5E4B8B]">Hidden from the feed after {String(e.context.reports ?? 3)} reports.</p> : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {e.kind === "report" && e.postId ? (
                    <>
                      <ActionButton
                        onClick={() => {
                          act.mutate({ path: `/feed/${e.postId}/remove`, method: "POST" });
                          act.mutate({ path: `/beta/feedback/${e.id}/resolve`, method: "POST" });
                        }}
                        danger
                      >
                        <Trash2 className="size-3.5" /> Remove post
                      </ActionButton>
                      <ActionButton
                        onClick={() => {
                          act.mutate({ path: `/feed/${e.postId}/restore`, method: "POST" });
                          act.mutate({ path: `/beta/feedback/${e.id}/resolve`, method: "POST" });
                        }}
                      >
                        <RotateCcw className="size-3.5" /> Keep and restore
                      </ActionButton>
                    </>
                  ) : (
                    <ActionButton onClick={() => act.mutate({ path: `/beta/feedback/${e.id}/resolve`, method: "POST" })}>
                      <Check className="size-3.5" /> {e.resolved ? "Reopen" : "Resolve"}
                    </ActionButton>
                  )}
                  <ActionButton onClick={() => act.mutate({ path: `/beta/feedback/${e.id}`, method: "DELETE" })}>
                    <Trash2 className="size-3.5" /> Delete
                  </ActionButton>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="surface p-4">
      <p className="font-display text-[38px] font-semibold leading-none tabular-nums" style={{ color: tone ?? "#1F2A44" }}>
        {value}
      </p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ActionButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("press inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold", danger ? "border-destructive/40 text-destructive hover:bg-destructive/10" : "border-border hover:bg-muted")}>
      {children}
    </button>
  );
}
