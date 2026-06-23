import { useCallback, useEffect, useState } from "react";

const KEY = "visitor_progress";
const GRADES_KEY = "visitor_grades";
const BASELINE_KEY = "visitor_baseline";

export type VisitorGrade = { grade: string; semester: string };
export type VisitorBaseline = { mode: "gpa" | "points"; gpa: string; credits: string; points: string };

const DEFAULT_BASELINE: VisitorBaseline = { mode: "gpa", gpa: "", credits: "", points: "" };

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

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

  const [grades, setGrades] = useState<Record<string, VisitorGrade>>(() => loadJSON(GRADES_KEY, {}));
  const [baseline, setBaselineState] = useState<VisitorBaseline>(() => loadJSON(BASELINE_KEY, DEFAULT_BASELINE));

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(Array.from(codes)));
  }, [codes]);

  useEffect(() => {
    localStorage.setItem(GRADES_KEY, JSON.stringify(grades));
  }, [grades]);

  useEffect(() => {
    localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline));
  }, [baseline]);

  const toggle = useCallback((code: string) => {
    setCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const setGrade = useCallback((code: string, field: "grade" | "semester", value: string) => {
    setGrades((prev) => {
      const cur = prev[code] ?? { grade: "", semester: "" };
      return { ...prev, [code]: { ...cur, [field]: value } };
    });
  }, []);

  const setBaseline = useCallback((next: VisitorBaseline) => setBaselineState(next), []);

  return { completedCodes: codes, toggle, grades, setGrade, baseline, setBaseline };
}
