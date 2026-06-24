// Saudi 5.0 grade scale (IMAMU) — shared by the dashboard and the Grades page.

export const GRADES = ["A+", "A", "B+", "B", "C+", "C", "D+", "D", "F"] as const;

export const GPA_POINTS: Record<string, number> = {
  "A+": 5.0, A: 4.75, "B+": 4.5, B: 4.0, "C+": 3.5, C: 3.0, "D+": 2.5, D: 2.0, F: 1.0,
};

export const MAX_GPA = 5.0;

export type SemesterOption = { value: string; label: string };

// First/Second/Summer terms from 2018 to next year, newest first.
export function buildSemesterOptions(lang: "ar" | "en"): SemesterOption[] {
  const opts: SemesterOption[] = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear + 1; y >= 2018; y--) {
    const ay = `${y}-${y + 1}`;
    opts.push(
      { value: `Summer-${y}`, label: lang === "ar" ? `صيف ${y}` : `Summer ${y}` },
      { value: `Second-${ay}`, label: lang === "ar" ? `الفصل الثاني ${ay}` : `Second Semester ${ay}` },
      { value: `First-${ay}`, label: lang === "ar" ? `الفصل الأول ${ay}` : `First Semester ${ay}` },
    );
  }
  return opts;
}
