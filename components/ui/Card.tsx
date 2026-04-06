import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Adds standard padding (p-5 md:p-6). Default true. */
  pad?: boolean;
}

/**
 * Verdant Card primitive.
 * - White bg, rounded 1rem, soft shadow, 1px border
 * - Flex-column layout — plays nicely with equal-height grids
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, pad = true, className = "", ...rest }, ref) => (
    <div
      ref={ref}
      className={`v-card ${pad ? "p-5 md:p-6" : ""} flex flex-col h-full ${className}`}
      {...rest}
    >
      {children}
    </div>
  ),
);
Card.displayName = "Card";
