"use client";

import type { CSSProperties, ReactNode } from "react";

interface MoneyTextProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function MoneyText({ children, className = "", style }: MoneyTextProps) {
  return (
    <span
      dir="ltr"
      className={`inline-block whitespace-nowrap tabular-nums ${className}`.trim()}
      style={style}
    >
      {children}
    </span>
  );
}
