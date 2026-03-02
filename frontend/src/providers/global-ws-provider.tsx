"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { createWsConnection } from "@/lib/api";

export function GlobalWebSocketProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Attempt standard connection to listen to user intents globally
    const connect = () => {
      const ws = createWsConnection();
      if (!ws) return;
      wsRef.current = ws;

      ws.onopen = () => {
        // Subscribe to global intent channel for all pairs
        ws.send(JSON.stringify({ type: "subscribe", channel: "intent", params: {} }));
        // Subscribe to global pool, prices, and orders too
        ws.send(JSON.stringify({ type: "subscribe", channel: "pool", params: {} }));
        ws.send(JSON.stringify({ type: "subscribe", channel: "prices", params: {} }));
        ws.send(JSON.stringify({ type: "subscribe", channel: "order", params: {} }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === "intentUpdate" || msg.type === "intent:update") {
             // Invalidate global intent keys
             queryClient.invalidateQueries({ queryKey: ["intents"] });
             queryClient.invalidateQueries({ queryKey: ["intents-paginated"] });
             // Invalidate portfolio so balances refresh correctly when an intent settles!
             queryClient.invalidateQueries({ queryKey: ["portfolio"] });
             queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
          }

          // Order status changes
          if (msg.type === "orderUpdate" || msg.type === "order:update") {
             queryClient.invalidateQueries({ queryKey: ["orders"] });
             queryClient.invalidateQueries({ queryKey: ["orders-paginated"] });
             queryClient.invalidateQueries({ queryKey: ["portfolio"] });
             queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
          }

          // If pool reserve or price changes
          if (msg.type === "poolUpdate" || msg.type === "pool:update") {
             queryClient.invalidateQueries({ queryKey: ["pool", msg.data?.poolId] });
             // Invalidate candle cache briefly so chart can pick it up on background refetch
             queryClient.invalidateQueries({ queryKey: ["getChartCandles", msg.data?.poolId] });
          }

        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        // Simple reconnect mechanism
        setTimeout(() => {
          if (document.visibilityState === "visible") connect();
        }, 5000);
      };
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [queryClient]);

  return <>{children}</>;
}
