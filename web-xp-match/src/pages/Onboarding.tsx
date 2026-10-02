import { ArrowLeft, ArrowRight, FileText, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Wordmark } from "@/components/xp/AppShell";
import { InterviewFlow } from "@/components/xp/onboarding/InterviewFlow";
import { ProfileReveal } from "@/components/xp/onboarding/ProfileReveal";
import { QuizFlow } from "@/components/xp/onboarding/QuizFlow";
import { TRAVELER_TYPES, TYPE_ORDER } from "@/data/travelerTypes";
import { IMG } from "@/lib/images";
import type { TasteProfile } from "@/lib/types";
import { useProfile } from "@/providers/ProfileProvider";

type Step = "choose" | "quiz" | "interview" | "reveal";

/** Fullscreen onboarding: questionnaire or AI interview → Taste Profile reveal. */
export default function Onboarding() {
  const navigate = useNavigate();
  const { skip, saveProfile, hasProfile } = useProfile();
  const [step, setStep] = useState<Step>("choose");
  const [result, setResult] = useState<TasteProfile | null>(null);

  const finish = (p: TasteProfile) => {
    setResult(p);
    setStep("reveal");
  };

  const exit = () => {
    if (!hasProfile) skip();
    navigate("/");
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1480px] items-center px-4 sm:px-8">
          <Wordmark />
          {step === "quiz" || step === "interview" ? (
            <button type="button" onClick={() => setStep("choose")} className="ml-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> Change method
            </button>
          ) : null}
          <button type="button" onClick={exit} className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-[15px] text-foreground/80 hover:bg-muted">
            <X className="size-4" /> {hasProfile ? "Close" : "Skip for now"}
          </button>
        </div>
      </header>

      {step === "choose" ? <Choose onPick={setStep} /> : null}
      {step === "quiz" ? <QuizFlow onDone={finish} /> : null}
      {step === "interview" ? <InterviewFlow onDone={finish} onFallbackToQuiz={() => setStep("quiz")} /> : null}
      {step === "reveal" && result ? (
        <ProfileReveal
          profile={result}
          onConfirm={() => {
            saveProfile(result);
            navigate("/");
          }}
          onRetake={() => setStep("choose")}
        />
      ) : null}
    </div>
  );
}

function Choose({ onPick }: { onPick: (s: Step) => void }) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-10 sm:px-8 lg:pt-14">
      <div className="mx-auto max-w-3xl text-center animate-rise">
        <h1 className="text-[44px] font-semibold leading-[1.02] text-secondary sm:text-6xl">Let's build your Taste Profile</h1>
        <p className="mt-4 text-lg text-foreground/75 sm:text-xl">Tell us how you travel and we'll match every pick to you.</p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <ChoiceCard
          image={IMG.onboardQuiz}
          icon={<FileText className="size-6" />}
          title="Take the questionnaire"
          meta="12 quick questions · 2 min"
          body="A simple way to tell us what you love so we can personalize your trips."
          cta="Start quiz"
          onClick={() => onPick("quiz")}
          delay={80}
        />
        <ChoiceCard
          image={IMG.onboardAi}
          icon={<MessageCircle className="size-6" />}
          title="Talk to our AI"
          meta="A relaxed 5 min chat interview"
          body="Have a natural conversation about your travel style, interests, and dreams."
          cta="Start interview"
          onClick={() => onPick("interview")}
          delay={160}
        />
      </div>

      <div className="mt-14 text-center">
        <p className="eyebrow text-foreground/80">Your profile blends four traveler types</p>
        <p className="mt-2 text-[15px] text-foreground/70">Everyone travels differently. Your taste is a unique blend of all four.</p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(["trailblazer", "architect", "curator", "drifter"] as const).map((id, i) => {
          const t = TRAVELER_TYPES[id];
          return (
            <div key={id} className="surface flex flex-col items-center px-4 pb-6 pt-5 text-center animate-rise" style={{ animationDelay: `${240 + i * 70}ms` }}>
              <img src={t.image} alt="" className="size-28 rounded-full object-cover sm:size-36" loading="lazy" />
              <h3 className="mt-4 text-2xl font-semibold text-secondary">{t.name}</h3>
              <p className="mt-1 text-[15px] text-foreground/75">{t.traits}</p>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t.temperament}</p>
            </div>
          );
        })}
      </div>
      <span className="sr-only">{TYPE_ORDER.join(", ")}</span>
    </div>
  );
}

interface ChoiceProps {
  image: string;
  icon: React.ReactNode;
  title: string;
  meta: string;
  body: string;
  cta: string;
  onClick: () => void;
  delay: number;
}

function ChoiceCard({ image, icon, title, meta, body, cta, onClick, delay }: ChoiceProps) {
  return (
    <div className="surface group grid overflow-hidden animate-rise sm:grid-cols-[1fr_1.1fr]" style={{ animationDelay: `${delay}ms` }}>
      <div className="relative h-56 overflow-hidden bg-muted sm:h-auto sm:min-h-[340px]">
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
      </div>
      <div className="flex flex-col p-6 sm:p-8">
        <div className="grid size-14 place-items-center rounded-full bg-muted text-secondary">{icon}</div>
        <h2 className="mt-5 text-[32px] font-semibold leading-tight text-secondary">{title}</h2>
        <p className="mt-1 text-[15px] text-foreground/75">{meta}</p>
        <div className="my-5 h-px w-12 bg-border" />
        <p className="flex-1 text-[15px] leading-relaxed text-foreground/80">{body}</p>
        <button
          type="button"
          onClick={onClick}
          className="press mt-6 inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-primary text-[17px] font-semibold text-primary-foreground shadow-[0_8px_20px_-10px_hsl(9_63%_48%/0.8)] transition-colors hover:bg-primary/90"
        >
          {cta} <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
}
