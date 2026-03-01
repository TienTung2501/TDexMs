"use client";

import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginatorProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Show total item count label. Default true. */
  showTotal?: boolean;
}

export function Paginator({
  page,
  pageSize,
  total,
  onPageChange,
  className,
  showTotal = true,
}: PaginatorProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Build visible page numbers with ellipsis
  const getPages = (): (number | "…")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "…")[] = [1];
    if (page > 4) pages.push("…");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 3) pages.push("…");
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className={cn("flex items-center gap-2 justify-between flex-wrap text-xs", className)}>
      {showTotal && (
        <span className="text-muted-foreground">
          {from}–{to} of {total}
        </span>
      )}
      <div className="flex items-center gap-1 ml-auto">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={page === 1}
          onClick={() => onPageChange(1)}
          title="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          title="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {getPages().map((p, idx) =>
          p === "…" ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground select-none">
              …
            </span>
          ) : (
            <Button
              key={p}
              size="icon"
              variant={p === page ? "default" : "ghost"}
              className="h-7 w-7 text-xs"
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </Button>
          )
        )}

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          title="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={page === totalPages}
          onClick={() => onPageChange(totalPages)}
          title="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Convenience hook to manage pagination state */
export function usePagination(pageSize: number = 10) {
  const [page, setPage] = React.useState(1);
  const goTo = (p: number) => setPage(p);
  const reset = () => setPage(1);
  const paginate = <T,>(items: T[]): T[] =>
    items.slice((page - 1) * pageSize, page * pageSize);
  return { page, pageSize, goTo, reset, paginate };
}

// ─── Cursor-based paginator ──────────────────────────────────────────────────
// For server-side cursor pagination (intents, orders, pools etc.).
// Does not assume sequential page numbers — only prev/next navigation.
// ─────────────────────────────────────────────────────────────────────────────
interface CursorPaginatorProps {
  /** Total records reported by the backend (may be approximate for large datasets) */
  total: number;
  /** First record index shown on this page (1-based) */
  rangeStart: number;
  /** Last record index shown on this page (1-based) */
  rangeEnd: number;
  /** Whether a next page exists */
  hasMore: boolean;
  /** Whether a previous page exists */
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  /** Show a subtle background-refetch indicator */
  loading?: boolean;
  className?: string;
}

export function CursorPaginator({
  total, rangeStart, rangeEnd, hasMore, hasPrev, onNext, onPrev, loading, className,
}: CursorPaginatorProps) {
  if (!hasMore && !hasPrev) return null;

  return (
    <div className={cn("flex items-center justify-between text-xs flex-wrap gap-2", className)}>
      <span className="text-muted-foreground">
        {total > 0 ? (
          <>
            {rangeStart}–{rangeEnd}
            {" "}of{" "}
            <span className="font-medium text-foreground">{total.toLocaleString()}</span>
          </>
        ) : loading ? (
          <span className="animate-pulse">Loading…</span>
        ) : null}
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={!hasPrev || loading}
          onClick={onPrev}
          title="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={!hasMore || loading}
          onClick={onNext}
          title="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
