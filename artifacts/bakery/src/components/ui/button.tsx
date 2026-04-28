import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
  "transition-all duration-150 ease-out " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "hover:-translate-y-px active:translate-y-0 active:scale-[0.98] " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform " +
  "hover:[&_svg]:scale-110",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary-border shadow-sm " +
          "hover:bg-primary/90 hover:shadow-md active:shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm border border-destructive-border " +
          "hover:bg-destructive/90 hover:shadow-md active:shadow-sm",
        outline:
          "border [border-color:var(--button-outline)] bg-background shadow-xs " +
          "hover:bg-accent hover:text-accent-foreground hover:shadow-sm hover:border-foreground/30 " +
          "active:bg-accent/80 active:shadow-none",
        secondary:
          "border bg-secondary text-secondary-foreground border-secondary-border shadow-xs " +
          "hover:bg-secondary/80 hover:shadow-sm active:shadow-none",
        ghost:
          "border border-transparent " +
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
        link:
          "text-primary underline-offset-4 hover:underline hover:translate-y-0",
      },
      size: {
        // @replit changed sizes
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
