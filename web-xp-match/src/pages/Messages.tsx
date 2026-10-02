import { ArrowLeft, ArrowUp, Loader2, MessagesSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { PersonAvatar } from "@/components/xp/PersonAvatar";
import { SignInPrompt } from "@/components/xp/SignInPrompt";
import { PLACE_BY_ID } from "@/data/places";
import { tagLabel } from "@/data/travelerTypes";
import { sharedLikes } from "@/lib/match";
import { firstName } from "@/lib/sharedProfile";
import { cn } from "@/lib/utils";
import { useProfile } from "@/providers/ProfileProvider";
import { useSocial } from "@/providers/SocialProvider";
import { useTrips } from "@/providers/TripsProvider";

const timeOf = (ms: number): string => {
  const d = new Date(ms);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Direct messages between signed-in travelers, delivered through the backend. */
export default function Messages() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSignedIn, threads, threadsLoading, threadFor, send, markRead, travelerById, matchFor, travelerMatches } = useSocial();
  const { profile } = useProfile();
  const { myPlaceIds } = useTrips();
  const [text, setText] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  const thread = id ? threadFor(id) : undefined;
  const traveler = travelerById(id);
  const otherName = traveler?.name ?? thread?.otherName ?? "";
  const otherAvatar = traveler?.avatar || thread?.otherAvatar || "";
  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  const score = id ? matchFor(id) : 0;

  useEffect(() => {
    if (id) markRead(id);
  }, [id, messages.length, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20">
        <SignInPrompt title="Message real travelers" body="Sign in to chat with people whose taste matches yours. Messages sync to every device you use." />
      </div>
    );
  }

  const both = traveler ? sharedLikes(profile.likes, traveler.likes).slice(0, 3) : [];
  const overlap = traveler ? traveler.savedPlaceIds.filter((p) => myPlaceIds.has(p)).map((p) => PLACE_BY_ID[p]?.name).filter(Boolean) : [];
  const first = firstName(otherName);
  const starters = id
    ? [overlap[0] ? `I saw you saved ${overlap[0]} too!` : traveler?.upcoming ? `How's planning for ${traveler.upcoming.split("·")[0].trim()} going?` : "Hi! Where are you headed next?", "Want to compare itineraries?", "Any spot I shouldn't miss?"]
    : [];

  const submit = (body: string) => {
    if (!id || !body.trim()) return;
    send(id, body);
    setText("");
  };

  const suggested = travelerMatches.filter((m) => !threads.some((t) => t.travelerId === m.traveler.id)).slice(0, 4);

  return (
    <div className="mx-auto grid h-[calc(100vh-var(--topbar))] max-w-[1480px] lg:grid-cols-[320px_1fr]">
      <aside className={cn("flex-col overflow-y-auto border-r border-border/70 scrollbar-thin", id ? "hidden lg:flex" : "flex")}>
        <h1 className="px-6 pb-3 pt-7 text-3xl font-semibold text-secondary">Messages</h1>
        {threadsLoading ? <Loader2 className="mx-6 my-4 size-5 animate-spin text-primary" aria-label="Loading messages" /> : null}
        {!threadsLoading && threads.length === 0 ? <p className="px-6 text-sm text-muted-foreground">No conversations yet. Say hi to someone below.</p> : null}
        <ul className="space-y-1 px-3">
          {threads.map((t) => {
            const tr = travelerById(t.travelerId);
            const name = tr?.name ?? t.otherName ?? "Traveler";
            const last = t.messages[t.messages.length - 1];
            return (
              <li key={t.travelerId}>
                <Link
                  to={`/messages/${encodeURIComponent(t.travelerId)}`}
                  aria-current={t.travelerId === id ? "page" : undefined}
                  className={cn("flex items-center gap-3 rounded-xl p-3", t.travelerId === id ? "bg-muted" : "hover:bg-muted/60")}
                >
                  <PersonAvatar name={name} src={tr?.avatar || t.otherAvatar} className="size-12 text-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{last ? timeOf(last.at) : ""}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn("truncate text-sm", t.unread ? "font-semibold text-foreground" : "text-muted-foreground")}>{last ? `${last.from === "me" ? "You: " : ""}${last.text}` : ""}</span>
                      {t.unread ? <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">{t.unread}</span> : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {suggested.length ? (
          <div className="mt-6 border-t border-border px-6 py-5">
            <p className="eyebrow mb-3">Start a conversation</p>
            {suggested.map(({ traveler: tr, score: s }) => (
              <Link key={tr.id} to={`/messages/${encodeURIComponent(tr.id)}`} className="flex items-center gap-3 rounded-lg py-2 hover:opacity-80">
                <PersonAvatar name={tr.name} src={tr.avatar} className="size-9" />
                <span className="flex-1 text-sm font-medium">{tr.name}</span>
                <span className="text-sm font-medium text-primary">{s}%</span>
              </Link>
            ))}
          </div>
        ) : null}
      </aside>

      <section className={cn("min-w-0 flex-col", id ? "flex" : "hidden lg:flex")} aria-label="Conversation">
        {id && (traveler || thread) ? (
          <>
            <header className="flex items-center gap-4 border-b border-border/70 px-4 py-4 sm:px-8">
              <button type="button" onClick={() => navigate("/messages")} className="grid size-10 place-items-center rounded-full hover:bg-muted lg:hidden" aria-label="Back to messages">
                <ArrowLeft className="size-5" />
              </button>
              <PersonAvatar name={otherName} src={otherAvatar} className="size-12 text-lg" />
              <div className="min-w-0 flex-1">
                {traveler ? (
                  <Link to={`/travelers/${encodeURIComponent(traveler.id)}`} className="font-display text-2xl font-semibold text-secondary hover:underline">
                    {otherName}
                  </Link>
                ) : (
                  <p className="font-display text-2xl font-semibold text-secondary">{otherName}</p>
                )}
                <p className="truncate text-sm text-muted-foreground">
                  {traveler ? <span className="font-medium text-primary">{score}% match</span> : "Not listed in the directory"}
                  {both.length ? ` · Both love ${both.map(tagLabel).join(", ")}` : ""}
                </p>
              </div>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-6 scrollbar-thin sm:px-8" aria-live="polite">
              {messages.length === 0 ? (
                <div className="mx-auto max-w-md pt-10 text-center">
                  <p className="font-display text-3xl text-secondary">Say hi to {first}</p>
                  <p className="mt-2 text-muted-foreground">{score ? `You're a ${score}% taste match. ` : ""}Break the ice:</p>
                </div>
              ) : null}
              {messages.map((m) => (
                <div key={m.id} className={cn("flex animate-rise", m.from === "me" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[75%]", m.from === "me" ? "text-right" : "")}>
                    <p className={cn("inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-[15.5px] leading-relaxed", m.from === "me" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card ring-1 ring-border/70")}>
                      {m.text}
                    </p>
                    <p className="mt-1 px-1 text-[11px] text-muted-foreground">{timeOf(m.at)}</p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="px-4 pb-5 sm:px-8">
              {messages.length < 2 && traveler ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {starters.map((s) => (
                    <button key={s} type="button" onClick={() => submit(s)} className="press rounded-full border border-border bg-card px-3.5 py-2 text-sm hover:border-primary/50 hover:bg-accent">
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(text);
                }}
                className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 pl-4 focus-within:border-primary/60"
              >
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={`Message ${first}…`} aria-label="Message" className="h-11 flex-1 bg-transparent outline-none placeholder:text-foreground/45" />
                <button type="submit" disabled={!text.trim()} aria-label="Send" className="press grid size-11 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
                  <ArrowUp className="size-5" />
                </button>
              </form>
            </div>
          </>
        ) : id ? (
          <div className="m-auto max-w-sm px-6 text-center">
            <p className="font-display text-3xl text-secondary">Traveler not found</p>
            <p className="mt-2 text-muted-foreground">They may have hidden their profile.</p>
            <Link to="/travelers" className="mt-5 inline-block font-semibold text-primary hover:underline">Find travelers →</Link>
          </div>
        ) : (
          <div className="m-auto max-w-sm px-6 text-center">
            <MessagesSquare className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-4 font-display text-3xl text-secondary">Your conversations</p>
            <p className="mt-2 text-muted-foreground">Chat with travelers who share your taste. Swap picks, compare itineraries, meet up on the road.</p>
            <Link to="/travelers" className="mt-5 inline-block font-semibold text-primary hover:underline">Find travelers →</Link>
          </div>
        )}
      </section>
    </div>
  );
}
