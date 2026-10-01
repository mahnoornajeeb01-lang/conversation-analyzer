"use client";

/**
 * Shared entrance motion: a <Stagger> reveals its <Reveal> children one after another
 * (fade + slight rise). Nested Staggers continue the cascade. Reduced-motion users get
 * instant changes via the MotionConfig in page.tsx.
 */

import { motion, type Variants } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export function Stagger({
  children,
  className,
  step = 0.07,
  root = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Seconds between children. */
  step?: number;
  /** The outermost Stagger starts the cascade and fades out on exit. */
  root?: boolean;
}) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: {}, show: { transition: { staggerChildren: step } } }}
      {...(root
        ? { initial: "hidden", animate: "show", exit: { opacity: 0, transition: { duration: 0.15 } } }
        : {})}
    >
      {children}
    </motion.div>
  );
}

export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
