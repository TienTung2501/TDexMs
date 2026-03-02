"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,  // 30s — most data doesn't change within 30s.
                                   // Hooks that need tighter freshness (e.g. usePrice)
                                   // override this with their own staleTime.
            retry: (failureCount, error) => {
              // Only retry on network errors or 5xx, up to 3 times (Exponential backoff is default)
              if (failureCount >= 3) return false;
              return true;
            },
            refetchOnWindowFocus: true,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
