"use client";

/**
 * Styled React Aria Components shared across the dashboard. React Aria supplies the
 * behaviour (keyboard, focus, press and hover states, ARIA); the state variants
 * (`hover:`, `pressed:`, `focus-visible:`, `disabled:`…) come from
 * tailwindcss-react-aria-components and read the data attributes it sets.
 */

import type { LucideIcon } from "lucide-react";
import {
  Button as AriaButton,
  OverlayArrow,
  Tooltip as AriaTooltip,
  TooltipTrigger,
  composeRenderProps,
  type ButtonProps as AriaButtonProps,
  type TooltipProps as AriaTooltipProps,
} from "react-aria-components";

export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500";

const VARIANTS = {
  primary: "bg-violet-600 text-white shadow-sm hover:bg-violet-700 pressed:bg-violet-800 dark:hover:bg-violet-500",
  secondary:
    "border border-slate-200 bg-surface text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 pressed:bg-slate-100",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 pressed:bg-slate-200",
  link: "text-violet-600 hover:bg-violet-50 dark:text-violet-700",
} as const;

const SIZES = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-3.5 text-sm",
  icon: "h-9 w-9",
} as const;

export interface ButtonProps extends AriaButtonProps {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className={composeRenderProps(
        className,
        (extra) =>
          `inline-flex shrink-0 cursor-default items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-150 pressed:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${focusRing} ${extra ?? ""}`,
      )}
    />
  );
}

export function Tooltip({ children, ...props }: Omit<AriaTooltipProps, "children"> & { children: React.ReactNode }) {
  return (
    <AriaTooltip
      offset={8}
      {...props}
      className="keep-palette group max-w-xs rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/10 transition-opacity duration-150 entering:opacity-0 exiting:opacity-0"
    >
      <OverlayArrow>
        <svg width={8} height={8} viewBox="0 0 8 8" className="fill-slate-900 group-placement-bottom:rotate-180 group-placement-left:-rotate-90 group-placement-right:rotate-90">
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
      {children}
    </AriaTooltip>
  );
}

/** Square icon-only button with a tooltip that doubles as its accessible name. */
export function IconButton({
  icon: Icon,
  label,
  variant = "secondary",
  ...props
}: Omit<ButtonProps, "children" | "size"> & { icon: LucideIcon; label: string }) {
  return (
    <TooltipTrigger delay={400}>
      <Button {...props} variant={variant} size="icon" aria-label={label}>
        <Icon className="h-4 w-4" />
      </Button>
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  );
}
