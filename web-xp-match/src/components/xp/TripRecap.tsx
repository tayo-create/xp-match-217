import { ChevronLeft, ChevronRight, Download, Loader2, Pause, Play, RotateCcw, Share2, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RECAP_MUSIC, RECAP_TIMING, type RecapData, recapDuration } from "@/lib/recap";
import { type RecapImages, drawRecap, loadRecapAssets, sceneAt, sceneStart } from "@/lib/recapRender";
import { cn } from "@/lib/utils";

type Format = "story" | "wide" | "square";

const FORMATS: Record<Format, { label: string; w: number; h: number }> = {
  story: { label: "Story 9:16", w: 1080, h: 1920 },
  square: { label: "Square", w: 1080, h: 1080 },
  wide: { label: "Wide 16:9", w: 1920, h: 1080 },
};

const PREVIEW_SCALE = 0.5;

const pickMime = (): string => {
  const options = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
};

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "trip";

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Full-screen trip recap: an animated slideshow of the trip's stops (photos, ratings, dishes) set to
 * music, ending on the route and trip stats. It can be saved as a video for Stories, Reels or TikTok.
 */
export function TripRecap({ data, onClose }: { data: RecapData | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(data)} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[96vh] w-[min(96vw,1100px)] max-w-none gap-0 overflow-hidden rounded-2xl border-0 bg-[#141B2D] p-0 text-white sm:rounded-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">{data?.title ?? "Trip recap"}</DialogTitle>
        <DialogDescription className="sr-only">An animated recap of the trip with photos, ratings and the route.</DialogDescription>
        {data ? <Player data={data} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Player({ data, onClose }: { data: RecapData; onClose: () => void }) {
  const [format, setFormat] = useState<Format>(() => (window.innerWidth > window.innerHeight * 1.2 ? "wide" : "story"));
  const [imgs, setImgs] = useState<RecapImages | null>(null);
  const [playing, setPlaying] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);
  const [t, setT] = useState<number>(0);
  const [exporting, setExporting] = useState<number | null>(null);
  const [video, setVideo] = useState<{ url: string; blob: Blob; ext: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tRef = useRef<number>(0);
  const cancelRef = useRef<boolean>(false);
  const total = useMemo(() => recapDuration(data), [data]);
  const still = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const f = FORMATS[format];

  useEffect(() => {
    let alive = true;
    setImgs(null);
    void loadRecapAssets(data).then((m) => alive && setImgs(m));
    return () => {
      alive = false;
    };
  }, [data]);

  useEffect(() => {
    const a = new Audio(RECAP_MUSIC);
    a.loop = true;
    a.volume = 0.55;
    audioRef.current = a;
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => () => {
    if (video) URL.revokeObjectURL(video.url);
  }, [video]);

  const draw = useCallback(
    (time: number) => {
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx || !imgs) return;
      drawRecap(ctx, data, imgs, time, c.width, c.height, still);
    },
    [data, imgs, still],
  );

  // Playback clock.
  useEffect(() => {
    if (!imgs || exporting !== null) return;
    if (!playing) {
      draw(tRef.current);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(total, tRef.current + (now - last));
      last = now;
      tRef.current = next;
      draw(next);
      setT(next);
      if (next >= total) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [imgs, playing, draw, total, exporting]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = muted;
    if (playing && imgs && exporting === null) void a.play().catch(() => setMuted(true));
    else a.pause();
  }, [playing, muted, imgs, exporting]);

  // Redraw immediately when the format changes.
  useEffect(() => {
    draw(tRef.current);
  }, [format, draw]);

  const seek = useCallback(
    (ms: number) => {
      const next = Math.max(0, Math.min(total, ms));
      tRef.current = next;
      setT(next);
      draw(next);
    },
    [total, draw],
  );

  const scene = sceneAt(data, t).k;
  const step = useCallback((dir: 1 | -1) => seek(sceneStart(data, Math.max(-1, Math.min(data.slides.length, scene + dir)))), [data, scene, seek]);

  const togglePlay = useCallback(() => {
    if (tRef.current >= total) seek(0);
    setPlaying((p) => !p);
  }, [total, seek]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (exporting !== null) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, step, exporting]);

  const exportVideo = async () => {
    if (!imgs) return;
    const mime = pickMime();
    if (!mime || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
      toast.error("This browser can't record video", { description: "Try Chrome, Edge or Safari 17+ on a computer." });
      return;
    }
    setPlaying(false);
    setExporting(0);
    cancelRef.current = false;
    const canvas = document.createElement("canvas");
    canvas.width = f.w;
    canvas.height = f.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setExporting(null);

    // A frame that taints the canvas would make the export throw; drop such images up front.
    const safe: RecapImages = new Map();
    imgs.forEach((img, src) => {
      if (!img) return safe.set(src, null);
      try {
        const probe = document.createElement("canvas").getContext("2d");
        probe?.drawImage(img, 0, 0, 1, 1);
        probe?.getImageData(0, 0, 1, 1);
        safe.set(src, img);
      } catch {
        safe.set(src, null);
      }
    });

    let audioCtx: AudioContext | null = null;
    const stream = canvas.captureStream(30);
    try {
      audioCtx = new AudioContext();
      const buf = await audioCtx.decodeAudioData(await (await fetch(RECAP_MUSIC)).arrayBuffer());
      const dest = audioCtx.createMediaStreamDestination();
      const gain = audioCtx.createGain();
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain).connect(dest);
      const now = audioCtx.currentTime;
      const end = now + total / 1000;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.8, now + 1);
      gain.gain.setValueAtTime(0.8, Math.max(now + 1, end - 2.2));
      gain.gain.linearRampToValueAtTime(0, end);
      src.start();
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    } catch (e) {
      console.warn("[recap] music unavailable for export", e instanceof Error ? e.message : e);
    }

    const chunks: BlobPart[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
    drawRecap(ctx, data, safe, 0, f.w, f.h, still);
    rec.start(1000);
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const frame = () => {
        const el = performance.now() - start;
        if (cancelRef.current || el >= total + 120) return resolve();
        drawRecap(ctx, data, safe, Math.min(total, el), f.w, f.h, still);
        setExporting(Math.min(1, el / total));
        // setTimeout keeps rendering when the tab loses focus (rAF would pause).
        window.setTimeout(frame, 1000 / 30);
      };
      frame();
    });
    rec.stop();
    await done;
    stream.getTracks().forEach((tr) => tr.stop());
    void audioCtx?.close();
    setExporting(null);
    if (cancelRef.current) return;
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    setVideo({ url: URL.createObjectURL(blob), blob, ext });
    toast.success("Your recap video is ready");
  };

  const fileName = video ? `${slug(data.title)}-recap.${video.ext}` : "";
  const canShareFile = Boolean(video && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([video.blob], fileName, { type: video.blob.type })] }));

  const shareVideo = async () => {
    if (!video) return;
    try {
      await navigator.share({ files: [new File([video.blob], fileName, { type: video.blob.type })], title: data.title, text: `${data.title}, planned with XP Match` });
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") toast.error("Couldn't open the share sheet.");
    }
  };

  const loading = !imgs;
  const aspect = `${f.w} / ${f.h}`;

  return (
    <div className="flex max-h-[96vh] flex-col md:flex-row">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/30 p-3 sm:p-5">
        <div className="relative max-h-[min(78vh,880px)] w-full" style={{ aspectRatio: aspect, maxWidth: `calc(min(78vh, 880px) * ${f.w / f.h})` }}>
          <canvas
            ref={canvasRef}
            width={Math.round(f.w * PREVIEW_SCALE)}
            height={Math.round(f.h * PREVIEW_SCALE)}
            onClick={exporting === null ? togglePlay : undefined}
            className="h-full w-full cursor-pointer rounded-xl bg-[#141B2D] shadow-2xl"
            aria-label={`Recap of ${data.title}. ${playing ? "Playing" : "Paused"}`}
          />
          {loading ? (
            <div className="absolute inset-0 grid place-items-center rounded-xl bg-[#141B2D]">
              <div className="text-center">
                <Loader2 className="mx-auto size-7 animate-spin text-white/70" />
                <p className="mt-3 text-sm text-white/70">Gathering your photos…</p>
              </div>
            </div>
          ) : null}
          {exporting !== null ? (
            <div className="absolute inset-0 grid place-items-center rounded-xl bg-[#141B2D]/85 backdrop-blur-sm">
              <div className="w-[min(80%,320px)] text-center">
                <p className="font-display text-[28px] font-semibold">Recording your recap</p>
                <p className="mt-1 text-sm text-white/70">It records in real time. Keep this window open.</p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round(exporting * 100)}%` }} />
                </div>
                <p className="mt-2 text-sm tabular-nums text-white/70">
                  {fmtTime(exporting * total)} / {fmtTime(total)}
                </p>
                <button type="button" onClick={() => (cancelRef.current = true)} className="mt-4 text-sm font-semibold text-white/80 underline-offset-4 hover:underline">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-5 border-t border-white/10 p-5 md:w-[300px] md:border-l md:border-t-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Trip recap</p>
            <p className="mt-1 font-display text-[26px] font-semibold leading-tight">{data.title}</p>
            <p className="mt-0.5 text-[13px] text-white/60">
              {data.stats.stops} stops{data.stats.rated ? ` · ${data.stats.rated} rated` : ""} · {fmtTime(total)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close recap" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-4" />
          </button>
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <CtrlButton label="Previous" onClick={() => step(-1)} disabled={loading || exporting !== null}>
              <ChevronLeft className="size-5" />
            </CtrlButton>
            <button
              type="button"
              onClick={togglePlay}
              disabled={loading || exporting !== null}
              aria-label={playing ? "Pause" : t >= total ? "Replay" : "Play"}
              className="press grid size-12 place-items-center rounded-full bg-white text-[#141B2D] disabled:opacity-50"
            >
              {playing ? <Pause className="size-5 fill-current" /> : t >= total ? <RotateCcw className="size-5" /> : <Play className="ml-0.5 size-5 fill-current" />}
            </button>
            <CtrlButton label="Next" onClick={() => step(1)} disabled={loading || exporting !== null}>
              <ChevronRight className="size-5" />
            </CtrlButton>
            <CtrlButton label={muted ? "Unmute music" : "Mute music"} onClick={() => setMuted((m) => !m)} className="ml-auto">
              {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </CtrlButton>
          </div>
          <input
            type="range"
            min={0}
            max={total}
            step={50}
            value={t}
            disabled={loading || exporting !== null}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Recap position"
            className="mt-4 w-full accent-[#C8452D]"
          />
          <div className="mt-1 flex justify-between text-[12px] tabular-nums text-white/55">
            <span>{fmtTime(t)}</span>
            <span>{fmtTime(total)}</span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Format</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(FORMATS) as Format[]).map((k) => (
              <button
                key={k}
                type="button"
                disabled={exporting !== null}
                onClick={() => {
                  setFormat(k);
                  setVideo(null);
                }}
                aria-pressed={format === k}
                className={cn("flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[12px] font-semibold", format === k ? "border-white bg-white/10" : "border-white/15 text-white/70 hover:bg-white/5")}
              >
                <span className="block rounded-[3px] border-2 border-current" style={{ width: k === "wide" ? 26 : k === "square" ? 18 : 12, height: k === "wide" ? 15 : k === "square" ? 18 : 21 }} />
                {FORMATS[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto space-y-2">
          {video ? (
            <>
              <a href={video.url} download={fileName} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
                <Download className="size-4" /> Save video
              </a>
              {canShareFile ? (
                <button type="button" onClick={() => void shareVideo()} className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/10 font-semibold hover:bg-white/15">
                  <Share2 className="size-4" /> Share
                </button>
              ) : null}
              <button type="button" onClick={() => setVideo(null)} className="w-full text-center text-[13px] text-white/60 hover:text-white">
                Make another version
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void exportVideo()}
              disabled={loading || exporting !== null}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {exporting !== null ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Make video
            </button>
          )}
          <p className="text-center text-[12px] leading-snug text-white/50">
            {f.w}×{f.h} with music, about {Math.round(total / 1000)} seconds. {RECAP_TIMING.slide / 1000}s per stop.
          </p>
        </div>
      </aside>
    </div>
  );
}

function CtrlButton({ label, onClick, disabled, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={cn("press grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40", className)}>
      {children}
    </button>
  );
}
