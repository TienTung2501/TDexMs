"use client";

import React from "react";
import { Loader2, CheckCircle2, AlertCircle, PenLine, Send, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type TxStage = "idle" | "building" | "signing" | "submitting" | "confirmed" | "error";

interface TxStatusProps {
  stage: TxStage;
  message?: string;
  txHash?: string;
  className?: string;
}

const STEPS: { stage: TxStage; label: string; icon: React.ReactNode }[] = [
  { stage: "building", label: "Building", icon: <Clock className="h-4 w-4" /> },
  { stage: "signing", label: "Signing", icon: <PenLine className="h-4 w-4" /> },
  { stage: "submitting", label: "Submitting", icon: <Send className="h-4 w-4" /> },
  { stage: "confirmed", label: "Confirmed", icon: <CheckCircle2 className="h-4 w-4" /> },
];

const STAGE_ORDER: TxStage[] = ["building", "signing", "submitting", "confirmed"];

/**
 * Multi-step transaction status indicator.
 * Shows a horizontal progress bar with icons for each TX lifecycle stage.
 */
export function TxStatus({ stage, message, txHash, className }: TxStatusProps) {
  if (stage === "idle") return null;

  const currentIdx = STAGE_ORDER.indexOf(stage);
  const isError = stage === "error";

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      {/* Step indicators */}
      <div className="flex items-center justify-between mb-3">
        {STEPS.map((step, idx) => {
          const isActive = step.stage === stage;
          const isCompleted = !isError && currentIdx > idx;
          const isPending = !isError && currentIdx < idx;

          return (
            <React.Fragment key={step.stage}>
              {idx > 0 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-1.5 rounded-full transition-colors",
                    isCompleted ? "bg-primary" : "bg-border"
                  )}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "rounded-full p-1.5 transition-colors",
                    isActive && !isError && "bg-primary/10 text-primary animate-pulse",
                    isCompleted && "bg-primary/10 text-primary",
                    isPending && "bg-muted text-muted-foreground",
                    isError && isActive && "bg-destructive/10 text-destructive"
                  )}
                >
                  {isActive && !isError ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isError && idx === currentIdx ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    step.icon
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isActive ? (isError ? "text-destructive" : "text-primary") : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Message */}
      {message && (
        <p
          className={cn(
            "text-xs text-center",
            isError ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {message}
        </p>
      )}

      {/* TX Hash link */}
      {txHash && (
        <div className="text-center mt-2">
          <a
            href={`https://preprod.cardanoscan.io/transaction/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            View on Cardanoscan →
          </a>
        </div>
      )}
    </div>
  );
}
