/**
 * useTransaction — Centralized CIP-30 transaction lifecycle hook.
 *
 * Per docs (lib/web3/txBuilder.ts pattern):
 *   All CIP-30 complexity is isolated here. Components never call
 *   signAndSubmitTx / signTx / submitTx directly — they call execute().
 *
 * Usage:
 *   const { execute, stage } = useTransaction();
 *
 *   await execute(
 *     () => createIntent({ senderAddress, ... }),        // builder fn (returns { unsignedTx, ... })
 *     {
 *       buildingMsg:  "Building swap transaction...",
 *       successMsg:   "Swap submitted!",
 *       action:       "create_intent",                   // for confirmTx
 *       extractId:    (res) => ({ intentId: res.intentId }), // extra fields for confirmTx
 *     }
 *   );
 */
"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@/providers/wallet-provider";
import { confirmTx } from "@/lib/api";
import { useTxToast, type TxStage } from "@/lib/tx-toast";

export interface TransactionOptions<TBuildResult = Record<string, unknown>> {
  /** Message shown while the backend builds the unsigned TX. */
  buildingMsg?: string;
  /** Message shown after successful submission. */
  successMsg?: string;
  /** Action tag sent to confirmTx (e.g. "create_intent", "create_order"). */
  action?: string;
  /** Extract extra fields from the build result to include in confirmTx. */
  extractId?: (result: TBuildResult) => Record<string, string>;
  /** Called after a successful TX submission with the txHash. */
  onSuccess?: (txHash: string, buildResult: TBuildResult) => void;
  /** Called on error. */
  onError?: (error: Error) => void;
  /** Skip the confirmTx call (default: false). */
  skipConfirm?: boolean;
}

export interface UseTransactionReturn {
  /**
   * Execute the full transaction lifecycle:
   *   build (backend) → sign (wallet) → submit (chain) → confirm (backend).
   *
   * @param builder  Async function that calls a backend build-TX endpoint.
   *                 Must return an object with at least `{ unsignedTx?: string }`.
   * @param options  Configuration for messages, callbacks, etc.
   * @returns        The TX hash on success, or null on failure.
   */
  execute: <T extends { unsignedTx?: string }>(
    builder: () => Promise<T>,
    options?: TransactionOptions<T>,
  ) => Promise<string | null>;
  /** Current stage of the TX lifecycle. */
  stage: TxStage | "idle";
  /** Whether a transaction is currently in progress. */
  busy: boolean;
  /** Toast container — render once in the component tree. */
  TxToastContainer: () => React.JSX.Element | null;
}

export function useTransaction(): UseTransactionReturn {
  const { signAndSubmitTx } = useWallet();
  const { toast, TxToastContainer } = useTxToast();
  const [stage, setStage] = useState<TxStage | "idle">("idle");
  const [busy, setBusy] = useState(false);

  const execute = useCallback(
    async <T extends { unsignedTx?: string }>(
      builder: () => Promise<T>,
      options?: TransactionOptions<T>,
    ): Promise<string | null> => {
      const {
        buildingMsg = "Building transaction...",
        successMsg = "Transaction confirmed!",
        action,
        extractId,
        onSuccess,
        onError,
        skipConfirm = false,
      } = options ?? {};

      setBusy(true);
      setStage("building");
      toast("building", buildingMsg);

      try {
        // 1. Build — backend constructs unsigned TX CBOR
        const result = await builder();

        if (!result.unsignedTx) {
          // Some endpoints (e.g. createPool) may succeed without TX
          toast("confirmed", successMsg);
          setStage("idle");
          setBusy(false);
          onSuccess?.("", result);
          return null;
        }

        // 2. Sign — CIP-30 wallet popup
        setStage("signing");
        toast("signing", "Please sign the transaction in your wallet...");
        const txHash = await signAndSubmitTx(result.unsignedTx);

        if (!txHash) {
          toast("error", "Transaction was not signed");
          setStage("idle");
          setBusy(false);
          return null;
        }

        // 3. Confirm — notify backend
        setStage("submitting");
        toast("submitting", "Confirming on-chain...");

        if (!skipConfirm && action) {
          const extra = extractId ? extractId(result) : {};
          await confirmTx({ txHash, action, ...extra }).catch(() =>
            console.warn("confirmTx call failed (non-critical)"),
          );
        }

        // 4. Done
        setStage("confirmed");
        toast("confirmed", successMsg, txHash);
        onSuccess?.(txHash, result);
        return txHash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setStage("error");
        toast("error", error.message);
        onError?.(error);
        return null;
      } finally {
        setBusy(false);
        // Reset stage after a delay so UI can show the final state
        setTimeout(() => setStage("idle"), 6000);
      }
    },
    [signAndSubmitTx, toast],
  );

  return { execute, stage, busy, TxToastContainer };
}
