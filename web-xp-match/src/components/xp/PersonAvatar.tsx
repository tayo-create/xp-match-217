import { memo, useState } from "react";

import { cn } from "@/lib/utils";

const TINTS = ["#C8452D", "#1F2A44", "#5E9C7C", "#D9A43A", "#E08A6A", "#4A6FA5"];

const tintFor = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
};

interface Props {
  name: string;
  src?: string;
  className?: string;
  /** Adds a green "online" dot. */
  online?: boolean;
}

/** A person's photo, or their initial on a stable color when there's no photo. */
export const PersonAvatar = memo(function PersonAvatar({ name, src, className, online }: Props) {
  const [failed, setFailed] = useState<boolean>(false);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span className={cn("relative inline-grid size-10 shrink-0 place-items-center", className)}>
      {src && !failed ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="size-full rounded-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center rounded-full font-display font-semibold text-white" style={{ background: tintFor(name), fontSize: "0.95em" }}>
          {initial}
        </span>
      )}
      {online ? <span className="absolute bottom-0 right-0 size-[28%] min-h-2 min-w-2 rounded-full bg-[#3F8A63] ring-2 ring-background" aria-label="Online" /> : null}
    </span>
  );
});
