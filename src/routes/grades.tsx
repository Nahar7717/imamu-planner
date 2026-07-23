import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { useVisitorProgress } from "@/hooks/useVisitorProgress";
import { GRADES, GPA_POINTS, MAX_GPA, buildSemesterOptions } from "@/lib/gpa";
import { toast } from "sonner";

export const Route = createFileRoute("/grades")({
  component: GradesPage,
  head: () => ({ meta: [{ title: "My Grades — Academic Planner" }] }),
});

// Convert Arabic-Indic digits (٠-٩) and Arabic decimal separator to Latin
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
   .replace(/[٫،]/g, ".");

// Keep digits + a single decimal point (for GPA input)
const normalizeDecimal = (s: string) => {
  const cleaned = toLatinDigits(s).replace(/[^0-9.]/g, "");
  const i = cleaned.indexOf(".");
  return i === -1 ? cleaned : cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/\./g, "");
};

// Keep digits only (for credits input)
const normalizeInteger = (s: string) => toLatinDigits(s).replace(/[^0-9]/g, "");

type CourseRow = {
  course_code: string;
  name: string;
  name_ar: string | null;
  credits: number;
  level_num: number | null;
  course_type: string;
  grade: string;
  semester: string;
  dirty: boolean; // changed by user
};

function GradesPage() {
  const navigate = useNavigate();
  const { user, loading, isVisitor } = useAuth();
  const { lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const visitor = useVisitorProgress();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user && !isVisitor) navigate({ to: "/auth" });
  }, [loading, user, isVisitor, navigate]);

  // All completed progress entries
  const { data: progress = [], isLoading: progressLoading } = useQuery({
    queryKey: ["progress-grades", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_progress")
        .select("*")
        .eq("student_id", user!.id)
        .eq("status", "completed");
      if (error) throw error;
      return data as { course_code: string; grade: string | null; semester_taken: string | null }[];
    },
  });

  // Baseline (prior GPA + credits) — e.g. for transfer students
  const { data: baseline } = useQuery({
    queryKey: ["baseline-gpa", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("baseline_gpa, baseline_credits, baseline_points")
        .eq("id", user!.id)
        .single();
      if (error) return null;
      return data;
    },
  });

  // Course details for completed codes (visitor: from localStorage, else Supabase)
  const completedCodes = useMemo(
    () => (isVisitor ? Array.from(visitor.completedCodes) : progress.map((p) => p.course_code)),
    [isVisitor, visitor.completedCodes, progress],
  );

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["courses-for-grades", completedCodes.join(",")],
    enabled: completedCodes.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase.from("courses") as any)
        .select("code, name, name_ar, credits, level_num, course_type")
        .in("code", completedCodes);
      if (error) throw error;
      return data as { code: string; name: string; name_ar: string | null; credits: number; level_num: number | null; course_type: string }[];
    },
  });

  // Local editable rows
  const [rows, setRows] = useState<CourseRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Baseline local state (string inputs, empty = not set)
  // baseMode picks which value the user types; the other is derived live.
  const [baseMode, setBaseMode] = useState<"gpa" | "points">("gpa");
  const [baseGpa, setBaseGpa] = useState("");
  const [baseCredits, setBaseCredits] = useState("");
  const [basePoints, setBasePoints] = useState("");
  const [baselineInit, setBaselineInit] = useState(false);
  const [baselineDirty, setBaselineDirty] = useState(false);

  useEffect(() => {
    if (baselineInit) return;
    if (isVisitor) {
      const b = visitor.baseline;
      setBaseMode(b.mode);
      setBaseGpa(b.gpa);
      setBaseCredits(b.credits);
      setBasePoints(b.points);
      setBaselineInit(true);
    } else if (baseline) {
      setBaseGpa(baseline.baseline_gpa != null ? String(baseline.baseline_gpa) : "");
      setBaseCredits(baseline.baseline_credits != null ? String(baseline.baseline_credits) : "");
      setBasePoints(baseline.baseline_points != null ? String(baseline.baseline_points) : "");
      setBaseMode(baseline.baseline_points != null ? "points" : "gpa");
      setBaselineInit(true);
    }
  }, [isVisitor, visitor.baseline, baseline, baselineInit]);

  const baseCreditsNum = parseInt(baseCredits, 10);
  const hasBaseCredits = !isNaN(baseCreditsNum) && baseCreditsNum > 0;
  // The value the user is typing (depends on mode); the other is derived.
  const typedGpaNum = parseFloat(baseGpa);
  const typedPointsNum = parseFloat(basePoints);
  // The resulting cumulative GPA must land in a valid range, whichever mode.
  const effectiveGpa = baseMode === "gpa" ? typedGpaNum : (hasBaseCredits ? typedPointsNum / baseCreditsNum : NaN);
  const gpaInRange = !isNaN(effectiveGpa) && effectiveGpa >= 0 && effectiveGpa <= MAX_GPA;
  const hasBaseline = hasBaseCredits && (baseMode === "gpa" ? !isNaN(typedGpaNum) : !isNaN(typedPointsNum)) && gpaInRange;
  // Prior points used in the GPA calc — exact when in points mode.
  const priorPoints = baseMode === "points" ? typedPointsNum : typedGpaNum * baseCreditsNum;
  // Live-derived display value for the non-editable field.
  const derivedPoints = hasBaseCredits && !isNaN(typedGpaNum) ? (typedGpaNum * baseCreditsNum).toFixed(2) : "";
  const derivedGpa = hasBaseCredits && !isNaN(typedPointsNum) ? (typedPointsNum / baseCreditsNum).toFixed(2) : "";

  // Switch input mode, carrying over the derived value so nothing is lost.
  const switchMode = (mode: "gpa" | "points") => {
    if (mode === baseMode) return;
    if (mode === "points") setBasePoints(derivedPoints);
    else setBaseGpa(derivedGpa);
    setBaseMode(mode);
    setBaselineDirty(true);
  };

  useEffect(() => {
    if (courses.length > 0 && completedCodes.length > 0 && !initialized) {
      const progressMap = new Map(progress.map((p) => [p.course_code, p]));
      const built: CourseRow[] = courses
        .map((c) => {
          let grade = "", semester = "";
          if (isVisitor) {
            const g = visitor.grades[c.code];
            grade = g?.grade ?? "";
            semester = g?.semester ?? "";
          } else {
            const p = progressMap.get(c.code);
            grade = p?.grade ?? "";
            semester = p?.semester_taken ?? "";
          }
          return {
            course_code: c.code,
            name: c.name,
            name_ar: c.name_ar,
            credits: c.credits,
            level_num: c.level_num,
            course_type: c.course_type,
            grade,
            semester,
            dirty: false,
          };
        })
        .sort((a, b) => (a.level_num ?? 99) - (b.level_num ?? 99) || a.course_code.localeCompare(b.course_code));
      setRows(built);
      setInitialized(true);
    }
  }, [courses, completedCodes, progress, isVisitor, visitor.grades, initialized]);

  const updateRow = (code: string, field: "grade" | "semester", value: string) => {
    setRows((prev) =>
      prev.map((r) => r.course_code === code ? { ...r, [field]: value, dirty: true } : r)
    );
  };

  const dirtyCount = rows.filter((r) => r.dirty).length;
  const hasChanges = dirtyCount > 0 || baselineDirty;

  // GPA preview from local state (folds in the baseline if set)
  const { previewGpa, previewCount, previewCredits } = useMemo(() => {
    let totalPoints = 0, totalCredits = 0, count = 0;
    for (const r of rows) {
      if (r.grade && GPA_POINTS[r.grade] !== undefined) {
        totalPoints += GPA_POINTS[r.grade] * r.credits;
        totalCredits += r.credits;
        count++;
      }
    }
    if (hasBaseline) {
      totalPoints += priorPoints;
      totalCredits += baseCreditsNum;
    }
    if (totalCredits === 0) return { previewGpa: null, previewCount: 0, previewCredits: 0 };
    return { previewGpa: totalPoints / totalCredits, previewCount: count, previewCredits: totalCredits };
  }, [rows, hasBaseline, priorPoints, baseCreditsNum]);

  const save = useMutation({
    mutationFn: async () => {
      if (isVisitor) {
        for (const r of rows.filter((r) => r.dirty)) {
          visitor.setGrade(r.course_code, "grade", r.grade);
          visitor.setGrade(r.course_code, "semester", r.semester);
        }
        if (baselineDirty) {
          visitor.setBaseline({
            mode: baseMode,
            credits: hasBaseline ? baseCredits : "",
            gpa: !hasBaseline ? "" : (baseMode === "gpa" ? baseGpa : derivedGpa),
            points: (!hasBaseline || baseMode === "gpa") ? "" : basePoints,
          });
        }
        return;
      }
      const dirty = rows.filter((r) => r.dirty);
      for (const r of dirty) {
        const { error } = await supabase.from("student_progress").upsert(
          {
            student_id: user!.id,
            course_code: r.course_code,
            status: "completed",
            grade: r.grade || null,
            semester_taken: r.semester || null,
          },
          { onConflict: "student_id,course_code" },
        );
        if (error) throw error;
      }
      if (baselineDirty) {
        const { error } = await supabase
          .from("profiles")
          .update({
            baseline_credits: hasBaseline ? baseCreditsNum : null,
            baseline_gpa: !hasBaseline ? null : (baseMode === "gpa" ? typedGpaNum : parseFloat(derivedGpa)),
            baseline_points: (!hasBaseline || baseMode === "gpa") ? null : typedPointsNum,
          })
          .eq("id", user!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setRows((prev) => prev.map((r) => ({ ...r, dirty: false })));
      setBaselineDirty(false);
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["progress-grades"] });
      qc.invalidateQueries({ queryKey: ["baseline-gpa"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(lang === "ar" ? "تم الحفظ ✓" : "Saved ✓");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  // Semester options
  const semesterOptions = useMemo(() => buildSemesterOptions(lang), [lang]);

  // Group rows by level
  const grouped = useMemo(() => {
    const map = new Map<number | null, CourseRow[]>();
    for (const r of rows) {
      const key = r.level_num;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort(([a], [b]) => (a ?? 99) - (b ?? 99));
  }, [rows]);

  const isLoading = (loading && !isVisitor) || progressLoading || (completedCodes.length > 0 && coursesLoading);

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background)", color: "var(--ds-muted)", fontFamily: "var(--font-sans)" }}>
        {lang === "ar" ? "جارٍ التحميل…" : "Loading…"}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", fontFamily: "var(--font-sans)" }}>

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--ds-header-bg)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--ds-line-soft, #1a1a1a)",
        padding: "0 20px", height: 52,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button
          onClick={() => navigate({ to: "/" })}
          style={{ background: "none", border: "none", color: "var(--ds-muted)", cursor: "pointer", fontSize: 13, fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 6 }}
        >
          ← {lang === "ar" ? "رجوع" : "Back"}
        </button>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--color-foreground)" }}>
          {lang === "ar" ? "درجاتي" : "My Grades"}
        </div>
        <button onClick={toggleTheme} style={{ background: "transparent", border: "1px solid var(--ds-line-strong, #333)", color: "var(--ds-body)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 13 }}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button onClick={() => setLang(lang === "en" ? "ar" : "en")} style={{ background: "transparent", border: "1px solid var(--ds-line-strong, #333)", color: "var(--ds-body)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
          {lang === "en" ? "ع" : "EN"}
        </button>
        {hasChanges && (
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            style={{
              padding: "7px 16px", border: "none", cursor: save.isPending ? "not-allowed" : "pointer",
              background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff",
              borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)",
              boxShadow: "0 0 20px rgba(249,115,22,0.35)",
              opacity: save.isPending ? 0.7 : 1,
            }}
          >
            {save.isPending
              ? (lang === "ar" ? "جارٍ الحفظ…" : "Saving…")
              : (lang === "ar" ? "حفظ" : "Save")}
          </button>
        )}
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 100px" }}>

        {/* Baseline / prior GPA card */}
        <div style={{
          background: "rgba(249,115,22,0.04)", border: "1px solid rgba(249,115,22,0.18)",
          borderRadius: 12, padding: "16px 20px", marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-foreground)", marginBottom: 4 }}>
            {lang === "ar" ? "نقطة البداية / المعدل السابق" : "Starting point / prior GPA"}
            <span style={{ fontSize: 11, fontWeight: 400, color: "var(--ds-muted)", marginInlineStart: 8 }}>
              {lang === "ar" ? "(اختياري)" : "(optional)"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ds-muted)", lineHeight: 1.6, marginBottom: 14 }}>
            {lang === "ar"
              ? "لو أنت محوّل أو تعرف معدلك وما تبي تدخل كل مادة قديمة — اختر طريقة الإدخال، اكتب ساعاتك السابقة والقيمة، ويُحسب فوقها المواد الجديدة. الخانة الثانية تتحسب تلقائياً."
              : "Transfer student, or already know your GPA? Pick an input method, enter your prior hours and the value — new courses build on top. The other field is computed automatically."}
          </div>

          {/* Mode toggle: GPA vs Points */}
          <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.25)", border: "1px solid var(--ds-line-strong, #333)", borderRadius: 8, padding: 3, marginBottom: 14 }}>
            {(["gpa", "points"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                style={{
                  padding: "5px 14px", cursor: "pointer", border: "none", borderRadius: 6,
                  background: baseMode === m ? "linear-gradient(135deg, #f97316, #ec4899)" : "transparent",
                  color: baseMode === m ? "#fff" : "var(--ds-muted)",
                  fontSize: 12, fontWeight: 600, fontFamily: "var(--font-sans)", transition: "all 150ms",
                }}
              >
                {m === "gpa" ? (lang === "ar" ? "بالمعدل" : "By GPA") : (lang === "ar" ? "بالنقاط (أدق)" : "By points (exact)")}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            {/* GPA — editable in gpa mode, derived in points mode */}
            <label style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", marginBottom: 6 }}>
                {lang === "ar" ? "المعدل التراكمي" : "Cumulative GPA"}
                {baseMode === "points" && <span style={{ color: "#22c55e", marginInlineStart: 6 }}>{lang === "ar" ? "(محسوب)" : "(auto)"}</span>}
              </div>
              <input
                type="text" inputMode="decimal" dir="ltr"
                placeholder="0.00 – 5.00"
                readOnly={baseMode === "points"}
                value={baseMode === "gpa" ? baseGpa : derivedGpa}
                onChange={(e) => { if (baseMode === "gpa") { setBaseGpa(normalizeDecimal(e.target.value)); setBaselineDirty(true); } }}
                style={{ width: "100%", padding: "9px 12px", background: baseMode === "points" ? "var(--ds-w02)" : "var(--ds-canvas-deep, rgba(0,0,0,0.3))", color: baseMode === "points" ? "var(--ds-muted)" : "var(--color-foreground)", border: "1px solid var(--ds-line-strong, #333)", borderRadius: 8, fontSize: 14, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box", textAlign: lang === "ar" ? "right" : "left", cursor: baseMode === "points" ? "default" : "text" }}
              />
            </label>
            {/* Prior hours — always editable */}
            <label style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", marginBottom: 6 }}>
                {lang === "ar" ? "الساعات السابقة" : "Prior hours"}
              </div>
              <input
                type="text" inputMode="numeric" dir="ltr"
                placeholder={lang === "ar" ? "مثال: 72" : "e.g. 72"}
                value={baseCredits}
                onChange={(e) => { setBaseCredits(normalizeInteger(e.target.value)); setBaselineDirty(true); }}
                style={{ width: "100%", padding: "9px 12px", background: "var(--ds-canvas-deep, rgba(0,0,0,0.3))", color: "var(--color-foreground)", border: "1px solid var(--ds-line-strong, #333)", borderRadius: 8, fontSize: 14, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box", textAlign: lang === "ar" ? "right" : "left" }}
              />
            </label>
            {/* Points — editable in points mode, derived in gpa mode */}
            <label style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", marginBottom: 6 }}>
                {lang === "ar" ? "النقاط" : "Points"}
                {baseMode === "gpa" && <span style={{ color: "#22c55e", marginInlineStart: 6 }}>{lang === "ar" ? "(محسوب)" : "(auto)"}</span>}
              </div>
              <input
                type="text" inputMode="decimal" dir="ltr"
                placeholder={lang === "ar" ? "مثال: 329.04" : "e.g. 329.04"}
                readOnly={baseMode === "gpa"}
                value={baseMode === "points" ? basePoints : derivedPoints}
                onChange={(e) => { if (baseMode === "points") { setBasePoints(normalizeDecimal(e.target.value)); setBaselineDirty(true); } }}
                style={{ width: "100%", padding: "9px 12px", background: baseMode === "gpa" ? "var(--ds-w02)" : "var(--ds-canvas-deep, rgba(0,0,0,0.3))", color: baseMode === "gpa" ? "var(--ds-muted)" : "var(--color-foreground)", border: `1px solid ${baseMode === "points" && hasBaseline ? "rgba(34,197,94,0.4)" : "var(--ds-line-strong, #333)"}`, borderRadius: 8, fontSize: 14, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box", textAlign: lang === "ar" ? "right" : "left", cursor: baseMode === "gpa" ? "default" : "text" }}
              />
            </label>
          </div>
          {(baseGpa !== "" || baseCredits !== "" || basePoints !== "") && !hasBaseline && (
            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 10 }}>
              {hasBaseCredits && !gpaInRange
                ? (lang === "ar"
                    ? `القيمة تعطي معدلاً خارج النطاق (0 – ${MAX_GPA.toFixed(2)}). تأكد من النقاط أو المعدل والساعات.`
                    : `That gives a GPA outside 0 – ${MAX_GPA.toFixed(2)}. Check your points/GPA and hours.`)
                : (lang === "ar"
                    ? "أدخل عدد الساعات (أكبر من صفر) مع القيمة المختارة حتى يُحتسب."
                    : "Enter prior hours (above 0) plus the selected value for it to count.")}
            </div>
          )}
          {hasBaseline && baseMode === "points" && (
            <div style={{ fontSize: 11, color: "#22c55e", marginTop: 10, lineHeight: 1.6 }}>
              {lang === "ar"
                ? "✓ يُحسب من النقاط مباشرة — أدق نتيجة، بدون تقريب."
                : "✓ Computed directly from points — exact, no rounding."}
            </div>
          )}
        </div>

        {/* Empty state */}
        {rows.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--ds-muted)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--color-foreground)", marginBottom: 8 }}>
              {lang === "ar" ? "لا توجد مقررات مكتملة بعد" : "No completed courses yet"}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {lang === "ar"
                ? "ارجع للوحة الرئيسية وضع علامة على المقررات التي أكملتها."
                : "Go back to the dashboard and mark the courses you've completed."}
            </div>
          </div>
        )}

        {/* GPA summary bar */}
        {(rows.length > 0 || hasBaseline) && (
          <div style={{
            background: "var(--ds-w03)", border: "1px solid var(--ds-w08)",
            borderRadius: 12, padding: "16px 20px", marginBottom: 24,
            display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
          }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", marginBottom: 4 }}>
                {lang === "ar" ? "المعدل التراكمي" : "Cumulative GPA"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-foreground)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                {previewGpa !== null ? previewGpa.toFixed(2) : "—"}
                <span style={{ fontSize: 13, color: "var(--ds-muted)", fontWeight: 400, marginLeft: 6 }}>/ 5.00</span>
              </div>
              {previewGpa !== null && (
                <div style={{ fontSize: 11, color: "var(--ds-muted)", marginTop: 4 }}>
                  {previewCredits} {lang === "ar" ? "ساعة" : "cr"}
                  {hasBaseline
                    ? (lang === "ar" ? ` · شامل ${baseCreditsNum} ساعة سابقة` : ` · incl. ${baseCreditsNum} prior cr`)
                    : ` · ${previewCount} ${lang === "ar" ? "مقرر" : "courses"}`}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Stat label={lang === "ar" ? "مكتملة" : "Completed"} value={String(rows.length)} />
              <Stat label={lang === "ar" ? "مُقيَّمة" : "Graded"} value={`${previewCount} / ${rows.length}`} />
              <Stat
                label={lang === "ar" ? "التقدير" : "Standing"}
                value={previewGpa === null ? "—"
                  : previewGpa >= 4.5 ? (lang === "ar" ? "ممتاز" : "Excellent")
                  : previewGpa >= 3.75 ? (lang === "ar" ? "جيد جداً" : "Very Good")
                  : previewGpa >= 2.75 ? (lang === "ar" ? "جيد" : "Good")
                  : previewGpa >= 2.0 ? (lang === "ar" ? "مقبول" : "Pass")
                  : (lang === "ar" ? "ضعيف" : "Weak")}
                color={previewGpa === null ? undefined : previewGpa >= 4.5 ? "#22c55e" : previewGpa >= 2.75 ? "#f97316" : "#ef4444"}
              />
            </div>
          </div>
        )}

        {/* Hint */}
        {rows.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--ds-muted)", marginBottom: 16, lineHeight: 1.6 }}>
            {lang === "ar"
              ? "اجلس مع كشف درجاتك واملأ الدرجة والفصل لكل مقرر. المعدل يتحدث فورياً."
              : "Sit with your academic transcript and fill in the grade and semester for each course. GPA updates live."}
          </div>
        )}

        {/* Grade table grouped by level */}
        {grouped.map(([level, levelRows]) => (
          <div key={level ?? "other"} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--ds-w06)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                {level ?? "—"}
              </span>
              {lang === "ar" ? `المستوى ${level ?? "—"}` : `Level ${level ?? "—"}`}
              <span style={{ fontSize: 11, color: "var(--ds-muted)", fontWeight: 400 }}>
                · {levelRows.filter(r => r.grade).length}/{levelRows.length} {lang === "ar" ? "مُقيَّم" : "graded"}
              </span>
            </div>

            <div style={{ border: "1px solid var(--ds-w07)", borderRadius: 10, overflow: "hidden" }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 48px 140px 180px", gap: 0, background: "var(--ds-w04)", padding: "8px 14px", borderBottom: "1px solid var(--ds-w06)" }}>
                {[
                  lang === "ar" ? "الرمز" : "Code",
                  lang === "ar" ? "اسم المقرر" : "Course Name",
                  lang === "ar" ? "س" : "Cr",
                  lang === "ar" ? "الدرجة" : "Grade",
                  lang === "ar" ? "الفصل الدراسي" : "Semester",
                ].map((h) => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 600, color: "var(--ds-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</div>
                ))}
              </div>

              {/* Rows */}
              {levelRows.map((row, i) => (
                <div
                  key={row.course_code}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 2fr 48px 140px 180px",
                    gap: 0,
                    padding: "9px 14px",
                    alignItems: "center",
                    borderBottom: i < levelRows.length - 1 ? "1px solid var(--ds-w05)" : "none",
                    background: row.dirty ? "rgba(249,115,22,0.04)" : i % 2 === 0 ? "transparent" : "var(--ds-w015)",
                    transition: "background 150ms",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#f97316" }}>{row.course_code}</div>
                  <div style={{ fontSize: 12, color: "var(--color-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                    {lang === "ar" && row.name_ar ? row.name_ar : row.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ds-muted)", fontFamily: "var(--font-mono)" }}>{row.credits}</div>

                  {/* Grade select */}
                  <select
                    value={row.grade}
                    onChange={(e) => updateRow(row.course_code, "grade", e.target.value)}
                    style={{
                      width: "90%", padding: "5px 8px",
                      background: row.grade ? "rgba(249,115,22,0.08)" : "var(--ds-w04)",
                      color: row.grade ? "#f97316" : "var(--ds-muted)",
                      border: `1px solid ${row.grade ? "rgba(249,115,22,0.3)" : "var(--ds-w10)"}`,
                      borderRadius: 6, fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600,
                      outline: "none", cursor: "pointer", appearance: "none", textAlign: "center",
                    }}
                  >
                    <option value="">—</option>
                    {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>

                  {/* Semester select */}
                  <select
                    value={row.semester}
                    onChange={(e) => updateRow(row.course_code, "semester", e.target.value)}
                    style={{
                      width: "95%", padding: "5px 8px",
                      background: "var(--ds-w04)", color: row.semester ? "var(--color-foreground)" : "var(--ds-muted)",
                      border: "1px solid var(--ds-w10)",
                      borderRadius: 6, fontSize: 11, fontFamily: "var(--font-sans)",
                      outline: "none", cursor: "pointer", appearance: "none",
                    }}
                  >
                    <option value="">—</option>
                    {semesterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Bottom save button */}
        {(rows.length > 0 || baselineDirty) && (
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", background: "var(--ds-bar-bg)", borderTop: "1px solid var(--ds-w07)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, backdropFilter: "blur(12px)" }}>
            <div style={{ fontSize: 12, color: "var(--ds-muted)" }}>
              {hasChanges
                ? (lang === "ar" ? "تغييرات غير محفوظة" : "Unsaved changes")
                : (lang === "ar" ? "كل شيء محفوظ ✓" : "All saved ✓")}
            </div>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || !hasChanges}
              style={{
                padding: "10px 28px", border: "none",
                cursor: !hasChanges || save.isPending ? "not-allowed" : "pointer",
                background: !hasChanges ? "var(--ds-w06)" : "linear-gradient(135deg, #f97316, #ec4899)",
                color: !hasChanges ? "var(--ds-muted)" : "#fff",
                borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)",
                boxShadow: hasChanges ? "0 0 20px rgba(249,115,22,0.3)" : "none",
                opacity: save.isPending ? 0.7 : 1,
                transition: "all 200ms",
              }}
            >
              {save.isPending
                ? (lang === "ar" ? "جارٍ الحفظ…" : "Saving…")
                : (lang === "ar" ? "حفظ" : "Save")}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? "var(--color-foreground)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--ds-muted)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
    </div>
  );
}
