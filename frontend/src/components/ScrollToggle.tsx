"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Button as AriaButton, TooltipTrigger } from "react-aria-components";

import { focusRing, Tooltip } from "@/components/aria";

/**
 * Floating button in the bottom-right corner: jumps to the bottom of the page from the
 * top half, and back to the top from the bottom half. Hidden when the page fits on screen.
 */
export default function ScrollToggle() {
  const [scrollable, setScrollable] = useState(false);
  const [goUp, setGoUp] = useState(false);

  useEffect(() => {
    const update = () => {
      const root = document.documentElement;
      const room = root.scrollHeight - window.innerHeight;
      setScrollable(room > 120);
      setGoUp(window.scrollY > room / 2);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // Content height changes as views switch and results arrive.
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, []);

  const label = goUp ? "Back to top" : "Scroll to bottom";
  const Icon = goUp ? ArrowUp : ArrowDown;

  return (
    <div
      className={`fixed right-4 bottom-4 z-40 transition-[opacity,translate] duration-200 sm:right-6 sm:bottom-6 ${
        scrollable ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
      aria-hidden={!scrollable}
    >
      <TooltipTrigger delay={300}>
        <AriaButton
          aria-label={label}
          isDisabled={!scrollable}
          onPress={() =>
            window.scrollTo({ top: goUp ? 0 : document.documentElement.scrollHeight, behavior: "smooth" })
          }
          className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-surface-solid text-slate-700 shadow-lg transition-colors hover:bg-slate-50 hover:text-violet-700 pressed:bg-slate-100 ${focusRing}`}
        >
          <Icon className="h-4.5 w-4.5" />
        </AriaButton>
        <Tooltip placement="left">{label}</Tooltip>
      </TooltipTrigger>
    </div>
  );
}
