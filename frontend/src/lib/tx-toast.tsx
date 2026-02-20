"use client";

import React, { useState, useCallback, useRef } from "react";
import { Loader2, CheckCircle2, AlertCircle, Send, Pen, PenLine, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type TxStage = "building" | "signing" | "submitting" | "confirmed" | "error";

interface TxToastState {
  id: number;
  stage: TxStage;
  message: string;
  txHash?: string;
  visible: boolean;
}

const STAGE_CONFIG: Record<TxStage, { icon: React.ReactNode; color: string; title: string }> = {
  building: {
    icon: <Loader2 className="h-5 w-5 animate-spin" />,
    color: "text-yellow-500",
    title: "Building Transaction",
  },
  signing: {
    icon: <PenLine className="h-5 w-5 animate-pulse" />,
    color: "text-blue-400",
    title: "Awaiting Signature",
  },
  submitting: {
    icon: <Send className="h-5 w-5 animate-pulse" />,
    color: "text-orange-400",
    title: "Submitting",
  },
  confirmed: {
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: "text-primary",
    title: "Confirmed",
  },
  error: {
    icon: <AlertCircle className="h-5 w-5" />,
    color: "text-destructive",
    title: "Error",
  },
};

/**
 * Lightweight TX-aware toast hook.
 * Usage:
 *   const { toast, TxToastContainer } = useTxToast();
 *   toast("building", "Constructing swap TX...");
 *   toast("confirmed", "Swap complete!", txHash);
 *   // Render <TxToastContainer /> once in your component tree.
 */
export function useTxToast() {
  const [toasts, setToasts] = useState<TxToastState[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (stage: TxStage, message: string, txHash?: string) => {
      const id = ++idRef.current;
      setToasts((prev) => {
        // Replace existing non-confirmed/non-error toasts for a smooth flow
        const filtered = prev.filter((t) => t.stage === "confirmed" || t.stage === "error");
        return [...filtered, { id, stage, message, txHash, visible: true }];
      });

      // Auto-dismiss confirmed/error after 6s
      if (stage === "confirmed" || stage === "error") {
        setTimeout(() => dismiss(id), 6000);
      }
    },
    [dismiss],
  );

  function TxToastContainer() {
    if (toasts.length === 0) return null;
    return (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => {
          const cfg = STAGE_CONFIG[t.stage];
          return (
            <div
              key={t.id}
              className={cn(
                "relative flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-xl backdrop-blur-sm",
                "animate-in slide-in-from-right-5 fade-in duration-300",
              )}
            >
              <div className={cn("mt-0.5 shrink-0", cfg.color)}>{cfg.icon}</div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold leading-tight", cfg.color)}>
                  {cfg.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 break-words">
                  {t.message}
                </p>
                {t.txHash && (
                  <a
                    href={`https://preprod.cardanoscan.io/transaction/${t.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    View on explorer
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return { toast, TxToastContainer, dismiss };
}
