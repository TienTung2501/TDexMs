"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  /** Deadline as ISO string or epoch milliseconds */
  deadline: string | number;
  /** Label shown before the countdown */
  label?: string;
  className?: string;
  /** Warn when fewer than this many seconds remain (default 300 = 5 min) */
  warnThreshold?: number;
  /** Called when the deadline is reached */
  onExpire?: () => void;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Live countdown timer for intent/order deadlines.
 * Shows remaining time with color-coded urgency.
 */
export function CountdownTimer({
  deadline,
  label,
  className,
  warnThreshold = 300,
  onExpire,
}: CountdownTimerProps) {
  const deadlineMs = useMemo(() => {
    if (typeof deadline === "number") return deadline;
    return new Date(deadline).getTime();
  }, [deadline]);

  const [remaining, setRemaining] = useState(() => deadlineMs - Date.now());

  useEffect(() => {
    const tick = () => {
      const ms = deadlineMs - Date.now();
      setRemaining(ms);
      if (ms <= 0) {
        onExpire?.();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineMs, onExpire]);

  const isExpired = remaining <= 0;
  const isWarning = !isExpired && remaining / 1000 < warnThreshold;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-mono",
        isExpired && "text-destructive",
        isWarning && "text-yellow-500",
        !isExpired && !isWarning && "text-muted-foreground",
        className,
      )}
    >
      {isWarning ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {label && <span className="font-sans">{label}</span>}
      {formatCountdown(remaining)}
    </span>
  );
}
