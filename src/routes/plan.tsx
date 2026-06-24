import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { useVisitorProgress } from "@/hooks/useVisitorProgress";
import { buildGraduationPlan } from "@/lib/graduationPlan";
import type { Course, Prerequisite, ElectiveGroup, ElectiveGroupCourse } from "@/lib/plannerLogic";

export const Route = createFileRoute("/plan")({
  component: PlanPage,
  head: () => ({ meta: [{ title: "Graduation Plan — Academic Planner" }] }),
});

const MIN_CREDITS = 12;
const MAX_CREDITS = 19;

function PlanPage() {
  const navigate = useNavigate();
  const { user, loading, isVisitor } = useAuth();
  const { lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const visitor = useVisitorProgress();

  useEffect(() => {
    if (!loading && !user && !isVisitor) navigate({ to: "/auth" });
  }, [loading, user, isVisitor, navigate]);

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("courses") as any)
        .select("*").order("level_num", { nullsFirst: false }).order("code");
      if (error) throw error;
      return data as Course[];
    },
  });
  const { data: prerequisites = [] } = useQuery({
    queryKey: ["prerequisites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prerequisites").select("*");
      if (error) throw error;
      return data as Prerequisite[];
    },
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["elective_groups"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("elective_groups") as any).select("*").order("group_id");
      if (error) throw error;
      return data as ElectiveGroup[];
    },
  });
  const { data: groupCourses = [] } = useQuery({
    queryKey: ["elective_group_courses"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("elective_group_courses") as any).select("*");
      if (error) throw error;
      return data as ElectiveGroupCourse[];
    },
  });
  const { data: progress = [] } = useQuery({
    queryKey: ["progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("student_progress").select("*").eq("student_id", user!.id);
      if (error) throw error;
      return data as { course_code: string; status: string }[];
    },
  });
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("major_id").eq("id", user!.id).single();
      if (error) return null;
      return data;
    },
  });

  const activeMajorId = isVisitor ? "cs" : (profile?.major_id ?? "cs");

  const majorCourses = useMemo(
    () => courses.filter((c) => !c.major_id || c.major_id === activeMajorId),
    [courses, activeMajorId],
  );

  const completedCodes = useMemo(() => {
    if (isVisitor) return new Set(visitor.completedCodes);
    return new Set(progress.filter((p) => p.status === "completed").map((p) => p.course_code));
  }, [isVisitor, visitor.completedCodes, progress]);

  const plan = useMemo(
    () => buildGraduationPlan(majorCourses, prerequisites, groups, groupCourses, completedCodes, {
      maxCredits: MAX_CREDITS, minCredits: MIN_CREDITS,
    }),
    [majorCourses, prerequisites, groups, groupCourses, completedCodes],
  );

  const isLoading = (loading && !isVisitor) || coursesLoading;
  const courseName = (c: Course) => (lang === "ar" && c.name_ar ? c.name_ar : c.name);
  const courseCode = (c: Course) => (lang === "ar" && c.code_ar ? c.code_ar : c.code);

  const termLabel = (i: number) =>
    i === 1 ? (lang === "ar" ? "الفصل القادم" : "Next term")
            : (lang === "ar" ? `الفصل +${i}` : `Term +${i}`);

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background)", color: "var(--ds-muted)", fontFamily: "var(--font-sans)" }}>
        {lang === "ar" ? "جارٍ التحميل…" : "Loading…"}
      </div>
    );
  }

  const nothingLeft = plan.terms.length === 0 && plan.blocked.length === 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", fontFamily: "var(--font-sans)" }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 10, background: "rgba(15,15,15,0.9)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--ds-line-soft, #1a1a1a)", padding: "0 20px", height: 52,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={() => navigate({ to: "/" })} style={{ background: "none", border: "none", color: "var(--ds-muted)", cursor: "pointer", fontSize: 13, fontFamily: "var(--font-sans)", display: "flex", alignItems: "center", gap: 6 }}>
          ← {lang === "ar" ? "رجوع" : "Back"}
        </button>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--color-foreground)" }}>
          {lang === "ar" ? "خطة التخرج" : "Graduation Plan"}
        </div>
        <button onClick={toggleTheme} style={{ background: "transparent", border: "1px solid var(--ds-line-strong, #333)", color: "var(--ds-body)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 13 }}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button onClick={() => setLang(lang === "en" ? "ar" : "en")} style={{ background: "transparent", border: "1px solid var(--ds-line-strong, #333)", color: "var(--ds-body)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
          {lang === "en" ? "ع" : "EN"}
        </button>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 100px" }}>
        {/* Graduated / nothing left */}
        {nothingLeft && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--ds-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎓</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-foreground)", marginBottom: 8 }}>
              {lang === "ar" ? "أكملت كل المتطلبات!" : "All requirements complete!"}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {lang === "ar" ? "ما تبقّى عليك مقررات في الخطة." : "Nothing left on your plan."}
            </div>
          </div>
        )}

        {!nothingLeft && (
          <>
            {/* Summary */}
            <div style={{
              background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.2)",
              borderRadius: 12, padding: "16px 20px", marginBottom: 22, display: "flex", gap: 24, flexWrap: "wrap",
            }}>
              <Stat label={lang === "ar" ? "فصول متبقية" : "Terms left"} value={String(plan.terms.length)} />
              <Stat label={lang === "ar" ? "ساعات متبقية" : "Credits left"} value={String(plan.totalRemainingCredits)} />
              <Stat label={lang === "ar" ? "مقررات متبقية" : "Courses left"} value={String(plan.terms.reduce((s, t) => s + t.courses.length, 0))} />
            </div>

            <div style={{ fontSize: 12, color: "var(--ds-muted)", marginBottom: 18, lineHeight: 1.6 }}>
              {lang === "ar"
                ? `خطة مقترحة حسب المتطلبات السابقة، من ${MIN_CREDITS} إلى ${MAX_CREDITS} ساعة لكل فصل. تتكيّف مع ما أكملته فعلاً.`
                : `Suggested path respecting prerequisites, ${MIN_CREDITS}–${MAX_CREDITS} credits per term. Adapts to what you've already completed.`}
            </div>

            {/* Term cards */}
            {plan.terms.map((term) => {
              const low = term.credits < MIN_CREDITS;
              return (
                <div key={term.index} style={{ marginBottom: 18, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "11px 16px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-foreground)" }}>{termLabel(term.index)}</div>
                    <div style={{
                      fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)",
                      color: low ? "#f59e0b" : "#22c55e",
                      background: low ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
                      border: `1px solid ${low ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.3)"}`,
                      borderRadius: 20, padding: "3px 10px",
                    }}>
                      {term.credits} {lang === "ar" ? "ساعة" : "cr"}
                      {low ? (lang === "ar" ? " · أقل من الحد" : " · below min") : ""}
                    </div>
                  </div>
                  <div>
                    {term.courses.map((c, i) => (
                      <div key={c.code} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "9px 16px",
                        borderBottom: i < term.courses.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#f97316", minWidth: 74 }}>{courseCode(c)}</span>
                        <span style={{ flex: 1, fontSize: 13, color: "var(--color-foreground)" }}>{courseName(c)}</span>
                        <span style={{ fontSize: 11, color: "var(--ds-muted)", fontFamily: "var(--font-mono)" }}>{c.credits} {lang === "ar" ? "س" : "cr"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Blocked courses */}
            {plan.blocked.length > 0 && (
              <div style={{ marginTop: 8, border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "14px 16px", background: "rgba(239,68,68,0.05)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", marginBottom: 8 }}>
                  {lang === "ar" ? "مقررات لم نتمكن من جدولتها (متطلبات سابقة ناقصة)" : "Couldn't schedule (unmet prerequisites)"}
                </div>
                {plan.blocked.map((c) => (
                  <div key={c.code} style={{ fontSize: 12, color: "var(--ds-muted)", padding: "2px 0" }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "#f97316" }}>{courseCode(c)}</span> · {courseName(c)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-foreground)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--ds-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
    </div>
  );
}
