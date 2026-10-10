import { useState } from "react";
import fallback from "@/assets/aero-fallback.jpg";
import type { PulseEvent } from "@/shared/types";
import { cn } from "@/lib/utils";

export function EventImage({ event, className, eager }: { event: PulseEvent; className?: string; eager?: boolean }) {
  const [broken, setBroken] = useState(false);
  const src = !event.imageUrl || broken ? fallback : event.imageUrl;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      onError={() => setBroken(true)}
      className={cn("size-full select-none object-cover", className)}
    />
  );
}
