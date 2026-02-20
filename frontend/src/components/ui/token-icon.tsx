"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { Token } from "@/lib/mock-data";

interface TokenIconProps {
  token: Token;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  xs: "h-4 w-4 text-[10px]",
  sm: "h-5 w-5 text-xs",
  md: "h-7 w-7 text-base",
  lg: "h-9 w-9 text-xl",
  xl: "h-11 w-11 text-2xl",
};

export function TokenIcon({ token, size = "md", className }: TokenIconProps) {
  const sizeClass = sizeMap[size];

  if (token.image) {
    return (
      <img
        src={token.image}
        alt={token.ticker}
        className={cn(sizeClass, "rounded-full object-cover flex-shrink-0", className)}
        loading="lazy"
        onError={(e) => {
          // Fallback to emoji on image load error
          const el = e.currentTarget;
          el.style.display = "none";
          const fallback = el.nextElementSibling;
          if (fallback) (fallback as HTMLElement).style.display = "flex";
        }}
      />
    );
  }

  return (
    <span
      className={cn(
        sizeClass,
        "rounded-full flex items-center justify-center flex-shrink-0 bg-muted",
        className
      )}
    >
      {token.logo}
    </span>
  );
}

/** Two overlapping token icons (pair display) */
interface TokenPairIconProps {
  tokenA: Token;
  tokenB: Token;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

export function TokenPairIcon({ tokenA, tokenB, size = "md", className }: TokenPairIconProps) {
  return (
    <div className={cn("flex items-center -space-x-1.5", className)}>
      <TokenIcon token={tokenA} size={size} className="ring-2 ring-background z-10" />
      <TokenIcon token={tokenB} size={size} className="ring-2 ring-background" />
    </div>
  );
}
