import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const homescopeButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "homescope-gradient-green text-primary-foreground shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:bg-homescope-green-light hover:border-primary/30 active:scale-[0.98]",
        accent:
          "homescope-gradient-orange text-accent-foreground shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
        ghost:
          "text-muted-foreground hover:text-foreground hover:bg-secondary",
      },
      size: {
        default: "h-11 px-6 py-2 text-sm",
        sm: "h-9 px-4 text-sm",
        lg: "h-13 px-8 py-3 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface HomescopeButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof homescopeButtonVariants> {}

const PrimaryButton = forwardRef<HTMLButtonElement, HomescopeButtonProps>(
  ({ className, variant = "primary", size, ...props }, ref) => (
    <button
      className={cn(homescopeButtonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
);
PrimaryButton.displayName = "PrimaryButton";

const SecondaryButton = forwardRef<HTMLButtonElement, HomescopeButtonProps>(
  ({ className, size, ...props }, ref) => (
    <button
      className={cn(homescopeButtonVariants({ variant: "secondary", size, className }))}
      ref={ref}
      {...props}
    />
  )
);
SecondaryButton.displayName = "SecondaryButton";

export { PrimaryButton, SecondaryButton, homescopeButtonVariants };
