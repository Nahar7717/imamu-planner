import { useCallback, useEffect, useState } from "react";

const KEY = "visitor_progress";

export function useVisitorProgress() {
  const [codes, setCodes] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(Array.from(codes)));
  }, [codes]);

  const toggle = useCallback((code: string) => {
    setCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  return { completedCodes: codes, toggle };
}
