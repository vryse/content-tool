import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { inputSurface } from "./input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(inputSurface, "resize-y py-2 leading-[1.5]", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";
