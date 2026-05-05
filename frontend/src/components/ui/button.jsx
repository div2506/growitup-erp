import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-white/5 border border-white/20 text-white hover:bg-white/10 hover:border-white/30",
        destructive:
          "bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60",
        outline:
          "bg-transparent border border-white/15 text-[#B3B3B3] hover:bg-white/5 hover:text-white hover:border-white/25",
        secondary:
          "bg-white/5 border border-white/10 text-[#B3B3B3] hover:bg-white/10 hover:text-white",
        ghost:
          "bg-transparent border border-transparent text-[#B3B3B3] hover:bg-white/5 hover:text-white",
        link:
          "bg-transparent border-0 text-white underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm",
        sm:      "h-8 px-3 text-xs",
        lg:      "h-10 px-6 text-sm",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
