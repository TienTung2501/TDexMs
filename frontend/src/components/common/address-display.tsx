"use client";

import React, { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { cn, truncateAddress } from "@/lib/utils";

interface AddressDisplayProps {
  address: string;
  /** Number of chars to show from start and end (default 8) */
  chars?: number;
  className?: string;
  /** Show Cardanoscan link */
  explorerLink?: boolean;
  /** Show copy button */
  copyable?: boolean;
}

/**
 * Truncated Cardano address with copy-to-clipboard and optional explorer link.
 */
export function AddressDisplay({
  address,
  chars = 8,
  className,
  explorerLink = true,
  copyable = true,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const truncated = truncateAddress(address, chars);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="font-mono text-xs" title={address}>
        {truncated}
      </span>
      {copyable && (
        <button
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Copy address"
        >
          {copied ? (
            <Check className="h-3 w-3 text-primary" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      )}
      {explorerLink && (
        <a
          href={`https://preprod.cardanoscan.io/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="View on Cardanoscan"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </span>
  );
}
