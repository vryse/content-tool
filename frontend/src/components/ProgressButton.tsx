import { Spinner } from "./Glyph";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const MotionButton = motion.create(Button);

type MotionOwnedProps =
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "style";

/** One spring for every size change on this button, so the widen and the settle match. */
const sizeSpring = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;

/**
 * An action button that becomes its own progress indicator. The long-running endpoints
 * stream stage labels and running cost, and those used to live in a separate line below the
 * button, which is two places to look for one operation. While it runs the button carries the
 * stage text, the accumulated cost, and a progress rule along its bottom edge.
 *
 * The idle→running switch changes the button's width by a lot, so the box is a layout
 * animation and the contents cross-fade inside it rather than snapping to the new size.
 */
export function ProgressButton({
  idleLabel,
  icon,
  running,
  status,
  cost = 0,
  step,
  total,
  className,
  ...props
}: {
  idleLabel: string;
  icon: ReactNode;
  running: boolean;
  status?: string | null;
  cost?: number;
  /** Present once the stream reports which stage of how many is running. */
  step?: number | null;
  total?: number | null;
  /* Motion redefines the drag/animation DOM events with its own signatures; this button
     uses none of them, so they are dropped rather than reconciled. */
} & Omit<React.ComponentPropsWithoutRef<typeof Button>, MotionOwnedProps>) {
  const label = status?.trim() || "Starting…";

  return (
    <MotionButton
      layout
      transition={sizeSpring}
      className={cn(
        "relative overflow-hidden",
        // A button that is busy is not a button that is unavailable, and the disabled dimming
        // would read as "you cannot do this" while it is doing exactly that.
        running && "min-w-[17rem] disabled:cursor-wait disabled:opacity-100",
        className,
      )}
      // Press feedback only while the button is actually pressable; a running button that
      // dips under the cursor reads as if the click did something.
      whileTap={running || props.disabled ? undefined : { scale: 0.98 }}
      aria-busy={running || undefined}
      {...props}
    >
      <motion.span layout="position" className="flex shrink-0 items-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={running ? "spinner" : "icon"}
            initial={{ opacity: 0, scale: 0.6, rotate: running ? -90 : 0 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex items-center"
          >
            {running ? <Spinner size={14} /> : icon}
          </motion.span>
        </AnimatePresence>
      </motion.span>

      <AnimatePresence mode="popLayout" initial={false}>
        {running ? (
          <motion.span
            key="running"
            layout="position"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            {/* Each new stage slides in, so a change of wording registers even when the
                button's width does not move. */}
            <span className="min-w-0 flex-1 overflow-hidden text-left" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="block truncate text-[0.8125rem] font-normal"
                >
                  {label}
                </motion.span>
              </AnimatePresence>
            </span>
            <AnimatePresence initial={false}>
              {cost > 0 && (
                <motion.span
                  key="cost"
                  initial={{ opacity: 0, width: 0, scale: 0.9 }}
                  animate={{ opacity: 0.8, width: "auto", scale: 1 }}
                  exit={{ opacity: 0, width: 0, scale: 0.9 }}
                  transition={sizeSpring}
                  className="t-data-sm shrink-0 overflow-hidden whitespace-nowrap"
                >
                  ${cost.toFixed(4)}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            layout="position"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="whitespace-nowrap"
          >
            {idleLabel}
          </motion.span>
        )}
      </AnimatePresence>

      {/* The bottom rule lives outside the content flow so it never takes part in the
          layout animation. It fades with the run instead. */}
      <AnimatePresence>
        {running && (
          <motion.span
            key="rule"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 bottom-0 h-0.5"
          >
            {/* A faint track keeps the filled part legible against the button. */}
            <span className="absolute inset-0 bg-current opacity-15" />
            {step && total ? (
              <motion.span
                className="absolute inset-0 origin-left bg-current opacity-70"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.min(step / total, 1) }}
                transition={{ type: "spring", stiffness: 160, damping: 26 }}
              />
            ) : (
              <motion.span
                className="absolute inset-0 origin-left bg-current opacity-70"
                initial={{ x: "0%", scaleX: 0.15 }}
                animate={{ x: ["0%", "85%", "0%"], scaleX: [0.15, 1, 0.15] }}
                transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
              />
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </MotionButton>
  );
}
