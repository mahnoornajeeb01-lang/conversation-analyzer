"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { ToggleButton, TooltipTrigger } from "react-aria-components";

import { focusRing, Tooltip } from "@/components/aria";
import { THEME_STORAGE_KEY } from "@/lib/theme";

function apply(dark: boolean) {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  window.setTimeout(() => root.classList.remove("theme-transition"), 300);
  root.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  // null until mounted: the server can't know the theme, so render a neutral placeholder.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = (next: boolean) => {
    apply(next);
    setDark(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* storage blocked (private mode); the toggle still works for this visit */
    }
  };

  return (
    <TooltipTrigger delay={400}>
      <ToggleButton
        isSelected={dark ?? false}
        onChange={toggle}
        aria-label="Dark mode"
        className={`flex h-9 w-9 shrink-0 cursor-default items-center justify-center rounded-lg border border-slate-200 bg-surface text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 pressed:bg-slate-100 ${focusRing}`}
      >
        {dark === null ? null : dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </ToggleButton>
      <Tooltip>{dark ? "Switch to light mode" : "Switch to dark mode"}</Tooltip>
    </TooltipTrigger>
  );
}
