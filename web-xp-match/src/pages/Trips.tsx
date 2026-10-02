import { CalendarDays, MapPin, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CITIES } from "@/data/places";
import { dayCount, formatRange, useTrips } from "@/providers/TripsProvider";

/** Trips index: every trip as an editorial card, plus a create-trip dialog. */
export default function Trips() {
  const { trips, deleteTrip } = useTrips();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<boolean>(params.get("new") === "1");

  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
  }, [params]);

  const close = (v: boolean) => {
    setOpen(v);
    if (!v && params.get("new")) {
      params.delete("new");
      setParams(params, { replace: true });
    }
  };

  return (
    <div className="mx-auto max-w-[1480px] px-4 pb-20 pt-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your trips</p>
          <h1 className="mt-2 text-5xl font-semibold text-secondary">Where to next?</h1>
          <p className="mt-2 text-lg text-foreground/70">Every itinerary is matched to your Taste Profile, stop by stop.</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="press inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" /> Plan a new trip
        </button>
      </div>

      {trips.length === 0 ? (
        <div className="surface mt-10 p-12 text-center">
          <p className="font-display text-3xl text-secondary">No trips yet</p>
          <p className="mt-2 text-muted-foreground">Start one here, or ask the concierge to plan it for you.</p>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {trips.map((t, i) => {
            const stops = t.days.reduce((s, d) => s + d.items.length, 0);
            return (
              <article key={t.id} className="surface group relative overflow-hidden animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
                <Link to={`/trips/${t.id}`} className="block">
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <img src={t.cover} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-secondary/80 via-secondary/10 to-transparent" />
                    <div className="absolute bottom-0 p-5 text-white">
                      <h2 className="text-[40px] font-semibold leading-none">{t.city}</h2>
                      <p className="mt-1 text-white/85">{t.country}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 p-5 text-[15px] text-foreground/80">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4" /> {formatRange(t.startDate, t.endDate)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4" /> {stops} stops
                    </span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    deleteTrip(t.id);
                    toast(`${t.city} trip deleted`);
                  }}
                  aria-label={`Delete ${t.city} trip`}
                  className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/85 text-foreground/70 opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      <NewTripDialog open={open} onOpenChange={close} />
    </div>
  );
}

function NewTripDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { createTrip } = useTrips();
  const navigate = useNavigate();
  const [city, setCity] = useState<string>("Lisbon");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [error, setError] = useState<string>("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim()) return setError("Where are you going?");
    if (!start || !end) return setError("Pick your dates.");
    if (end < start) return setError("The trip has to end after it starts.");
    if (dayCount(start, end) > 21) return setError("Keep it to 21 days or fewer.");
    const t = createTrip(city, start, end);
    onOpenChange(false);
    setError("");
    navigate(`/trips/${t.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-semibold text-secondary">Plan a new trip</DialogTitle>
          <DialogDescription>We'll match every stop to your Taste Profile.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Destination</span>
            <input list="xp-cities" value={city} onChange={(e) => setCity(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:border-primary" />
            <datalist id="xp-cities">
              {CITIES.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
            <span className="mt-1 block text-xs text-muted-foreground">Any city in the world. Hand-picked guides for {CITIES.map((c) => c.name).join(", ")}.</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Start</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:border-primary" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">End</span>
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:border-primary" />
            </label>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <button type="submit" className="press h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
            Create trip
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
