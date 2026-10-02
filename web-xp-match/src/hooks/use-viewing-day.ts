import { useEffect, useState, type RefObject } from "react";

interface Options {
  /** The scrolling element. Omit to follow the page (window) scroll. */
  scrollRoot?: RefObject<HTMLElement | null>;
  /** Where to look for the day sections, marked with `data-day="<index>"`. */
  container: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Changes whenever the sections may have moved (stops added, removed, swapped). */
  layoutKey?: string;
}

/**
 * The itinerary day the reader is looking at: the last day section whose header has passed a reading line
 * about a third of the way down the viewport. Returns undefined at the very top (so the map can show
 * the whole trip) and while disabled. Scroll handling is throttled to animation frames.
 */
export function useViewingDay({ scrollRoot, container, enabled, layoutKey }: Options): number | undefined {
  const [day, setDay] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setDay(undefined);
      return;
    }
    const root = scrollRoot?.current ?? null;
    const target: HTMLElement | Window = root ?? window;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const box = container.current;
      if (!box) return;
      const sections = Array.from(box.querySelectorAll<HTMLElement>("[data-day]"));
      if (sections.length === 0) {
        setDay(undefined);
        return;
      }
      const top = root ? root.getBoundingClientRect().top : 0;
      const height = root ? root.clientHeight : window.innerHeight;
      const scrolled = root ? root.scrollTop : window.scrollY;
      const scrollHeight = root ? root.scrollHeight : document.documentElement.scrollHeight;
      const line = top + height * 0.34;

      const firstTop = sections[0].getBoundingClientRect().top;
      if (scrolled < 24 || firstTop > line) {
        setDay(undefined);
        return;
      }

      let current = sections[0];
      for (const s of sections) {
        if (s.getBoundingClientRect().top <= line) current = s;
      }
      // At the very bottom, a short last day can never reach the line; pick it if its header is on screen.
      if (scrolled + height >= scrollHeight - 8) {
        const visible = sections.filter((s) => s.getBoundingClientRect().top < top + height - 40);
        if (visible.length) current = visible[visible.length - 1];
      }
      const n = Number(current.dataset.day);
      setDay(Number.isFinite(n) ? n : undefined);
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled, scrollRoot, container, layoutKey]);

  return day;
}
