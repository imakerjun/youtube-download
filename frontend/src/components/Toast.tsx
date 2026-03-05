import { useState, useEffect, useCallback, useRef } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let nextId = 0;
let addToastFn: ((message: string, type: ToastItem["type"]) => void) | null = null;

export function toast(message: string, type: ToastItem["type"] = "info") {
  addToastFn?.(message, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const addToastRef = useRef<(message: string, type: ToastItem["type"]) => void>();

  const addToast = useCallback((message: string, type: ToastItem["type"]) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  addToastRef.current = addToast;

  useEffect(() => {
    addToastFn = (msg, type) => addToastRef.current?.(msg, type);
    return () => { addToastFn = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg px-4 py-3 text-sm shadow-lg animate-slide-in
            ${t.type === "success" ? "bg-green-900/90 text-green-200 border border-green-700" : ""}
            ${t.type === "error" ? "bg-red-900/90 text-red-200 border border-red-700" : ""}
            ${t.type === "info" ? "bg-gray-800/90 text-gray-200 border border-gray-600" : ""}
          `}
        >
          <span className="mr-2">
            {t.type === "success" && "✓"}
            {t.type === "error" && "✗"}
            {t.type === "info" && "ℹ"}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
