import { useEffect, useRef } from "react";
import type { ProgressMessage } from "../api/types";

export function useProgressWebSocket(
  onProgress: (msg: ProgressMessage) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const callbackRef = useRef(onProgress);
  callbackRef.current = onProgress;

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/progress`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as ProgressMessage;
      callbackRef.current(data);
    };

    ws.onclose = () => {
      setTimeout(() => {
        wsRef.current = null;
      }, 3000);
    };

    wsRef.current = ws;
    return () => ws.close();
  }, []);

  return wsRef;
}
