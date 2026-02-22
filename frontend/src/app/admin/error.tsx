"use client";

import { useEffect } from "react";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8">
      <div className="p-4 rounded-full bg-destructive/10">
        <ShieldAlert className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="text-xl font-bold">Admin Panel Error</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Failed to load admin data. Ensure you have the correct permissions and
        the backend is running.
      </p>
      {error.message && (
        <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded max-w-md truncate">
          {error.message}
        </p>
      )}
      <Button onClick={reset} variant="outline" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
