import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVisitorProgress } from "@/hooks/useVisitorProgress";
import {
  getCourseStatus,
  getSuggestedCourses,
  type Course,
  type Prerequisite,
  type ElectiveGroup,
  type ElectiveGroupCourse,
  type CourseStatus,
} from "@/lib/plannerLogic";
import { CourseCard } from "@/components/CourseCard";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useTheme } from "@/hooks/useTheme";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Academic Planner" }] }),
});

const TAB_KEYS = ["dashboard", "cs_core", "cs_elec", "uni"] as const;
type TabKey = (typeof TAB_KEYS)[number];

// ─── Category accent colors ───
const CAT_COLORS = ["#1a26ff", "#00d4ff", "#7b3aed", "#33d17a"] as const;

function Dashboard() {
  const { user, loading, isVisitor, exitVisitorMode } = useAuth();
  const { lang, setLang, isRtl } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const s = t(lang);
  const qc = useQueryClient();
  const visitor = useVisitorProgress();
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [recentUnlocks, setRecentUnlocks] = useState(new Set<string>());

  const TABS = TAB_KEYS.map((key) => ({ key, label: s.tabs[key] }));

  useEffect(() => {
    if (!loading && !user && !isVisitor) window.location.href = "/auth";
  }, [user, loading, isVisitor]);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("courses") as any)
        .select("*")
        .order("level_num", { nullsFirst: false })
        .order("code");
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
      const { data, error } = await (supabase.from("elective_groups") as any)
        .select("*")
        .order("group_id");
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
      const { data, error } = await supabase
        .from("student_progress")
        .select("*")
        .eq("student_id", user!.id);
      if (error) throw error;
      return data as { course_code: string; status: string }[];
    },
  });

  const completedCodes = useMemo(
    () =>
      isVisitor
        ? visitor.completedCodes
        : new Set(progress.filter((p) => p.status === "completed").map((p) => p.course_code)),
    [progress, isVisitor, visitor.completedCodes],
  );

  const toggle = useMutation({
    mutationFn: async (course: Course) => {
      if (isVisitor) {
        const was = visitor.completedCodes.has(course.code);
        visitor.toggle(course.code);
        return { unmarked: was };
      }
      if (!user) throw new Error("Not authenticated");
      if (completedCodes.has(course.code)) {
        const { error } = await supabase
          .from("student_progress")
          .delete()
          .eq("student_id", user.id)
          .eq("course_code", course.code);
        if (error) throw error;
        return { unmarked: true };
      } else {
        const { error } = await supabase.from("student_progress").upsert(
          { student_id: user.id, course_code: course.code, status: "completed" },
          { onConflict: "student_id,course_code" },
        );
        if (error) throw error;
        return { unmarked: false };
      }
    },
    onSuccess: (r, course) => {
      qc.invalidateQueries({ queryKey: ["progress", user?.id] });
      toast.success(r.unmarked ? `${lang === "ar" ? "تم إلغاء" : "Unmarked"} ${course.code}` : `${lang === "ar" ? "اكتمل" : "Completed"} ${course.code}`);
      if (!r.unmarked) {
        // Find newly unlocked courses
        const newCompleted = new Set(completedCodes);
        newCompleted.add(course.code);
        const unlocked = new Set(
          courses
            .filter((c) => {
              const before = getCourseStatus(c, completedCodes, prerequisites);
              const after = getCourseStatus(c, newCompleted, prerequisites);
              return before === "locked" && after === "available";
            })
            .map((c) => c.code),
        );
        if (unlocked.size > 0) {
          setRecentUnlocks(unlocked);
          setTimeout(() => setRecentUnlocks(new Set()), 2000);
        }
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const coursesByCode = useMemo(() => {
    const m = new Map<string, Course>();
    for (const c of courses) m.set(c.code, c);
    return m;
  }, [courses]);

  const getMissingPrereqs = useCallback(
    (course: Course) =>
      prerequisites
        .filter((p) => p.course_code === course.code && !completedCodes.has(p.prereq_code))
        .map((p) => p.prereq_code),
    [prerequisites, completedCodes],
  );

  // Credit cap: an available course is capped when its group's required credits are already met
  const isCourseCapped = useCallback(
    (course: Course) => {
      if (completedCodes.has(course.code)) return false; // already done — always uncap
      const belongsTo = groupCourses.filter((gc) => gc.course_code === course.code);
      for (const gc of belongsTo) {
        const group = groups.find((g) => g.group_id === gc.group_id);
        if (!group) continue;
        const memberCodes = groupCourses.filter((g) => g.group_id === gc.group_id).map((g) => g.course_code);
        const doneCredits = courses
          .filter((c) => memberCodes.includes(c.code) && completedCodes.has(c.code))
          .reduce((s, c) => s + c.credits, 0);
        if (doneCredits >= group.required_credits) return true;
      }
      return false;
    },
    [groupCourses, groups, courses, completedCodes],
  );

  const cat = useMemo(() => {
    const csCore = courses.filter((c) => c.course_type === "cs_core");
    const uniMandatory = courses.filter((c) => c.course_type === "uni_mandatory");

    const completedCount = (list: Course[]) => list.filter((c) => completedCodes.has(c.code)).length;
    const completedCredits = (list: Course[]) =>
      list.filter((c) => completedCodes.has(c.code)).reduce((s, c) => s + c.credits, 0);
    const totalCredits = (list: Course[]) => list.reduce((s, c) => s + c.credits, 0);

    const groupSummary = (gid: string) => {
      const g = groups.find((x) => x.group_id === gid);
      const codes = groupCourses.filter((gc) => gc.group_id === gid).map((gc) => gc.course_code);
      const list = codes.map((c) => coursesByCode.get(c)).filter(Boolean) as Course[];
      const done = list.filter((c) => completedCodes.has(c.code));
      const doneCredits = done.reduce((s, c) => s + c.credits, 0);
      return {
        group: g,
        list,
        doneCount: done.length,
        doneCredits,
        requiredCount: g?.required_count ?? 0,
        requiredCredits: g?.required_credits ?? 0,
      };
    };

    const csElec = groupSummary("CS_ELEC");
    const free = groupSummary("FREE");
    const uniG = ["UNI_G1", "UNI_G2", "UNI_G3", "UNI_G4", "UNI_G5"].map(groupSummary);

    const uniReqRequired =
      totalCredits(uniMandatory) + uniG.reduce((s, g) => s + g.requiredCredits, 0);
    const uniReqDone =
      completedCredits(uniMandatory) +
      uniG.reduce((s, g) => s + Math.min(g.doneCredits, g.requiredCredits), 0);

    return {
      csCore: {
        list: csCore,
        done: completedCount(csCore),
        total: csCore.length,
        doneCredits: completedCredits(csCore),
        totalCredits: totalCredits(csCore),
      },
      csElec,
      uniMandatory: {
        list: uniMandatory,
        doneCredits: completedCredits(uniMandatory),
        totalCredits: totalCredits(uniMandatory),
      },
      uniG,
      free,
      uniReq: { done: uniReqDone, total: uniReqRequired },
    };
  }, [courses, groups, groupCourses, coursesByCode, completedCodes]);

  const overallTotal =
    cat.csCore.totalCredits +
    cat.csElec.requiredCredits +
    cat.uniReq.total +
    cat.free.requiredCredits;
  const overallDone =
    cat.csCore.doneCredits +
    Math.min(cat.csElec.doneCredits, cat.csElec.requiredCredits) +
    cat.uniReq.done +
    Math.min(cat.free.doneCredits, cat.free.requiredCredits);
  const overallPct = overallTotal > 0 ? overallDone / overallTotal : 0;

  const suggested = useMemo(
    () => getSuggestedCourses(courses, completedCodes, prerequisites, 4),
    [courses, completedCodes, prerequisites],
  );

  const signOut = async () => {
    if (isVisitor) {
      exitVisitorMode();
    } else {
      await supabase.auth.signOut();
    }
    window.location.href = "/auth";
  };

  if (loading || (!user && !isVisitor)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-background)", color: "var(--ds-muted)" }}>
        Loading…
      </div>
    );
  }

  const renderCard = (c: Course) => (
    <CourseCard
      key={c.code}
      course={c}
      status={getCourseStatus(c, completedCodes, prerequisites)}
      onToggle={() => toggle.mutate(c)}
      missingPrereqs={getMissingPrereqs(c)}
      recentlyUnlocked={recentUnlocks.has(c.code)}
      capped={isCourseCapped(c)}
    />
  );

  const catBlocks = [
    { key: "cs_core" as TabKey, label: s.sections.csCore, done: cat.csCore.doneCredits, total: cat.csCore.totalCredits, sub: `${cat.csCore.done} / ${cat.csCore.total} ${s.sections.courses}`, color: CAT_COLORS[0] },
    { key: "cs_elec" as TabKey, label: s.sections.csElec, done: Math.min(cat.csElec.doneCredits, cat.csElec.requiredCredits), total: cat.csElec.requiredCredits, sub: `${s.sections.pick} ${cat.csElec.requiredCount} · ${cat.csElec.doneCount} ${s.sections.chosen}`, color: CAT_COLORS[1] },
    { key: "uni" as TabKey, label: s.sections.uni, done: cat.uniReq.done + Math.min(cat.free.doneCredits, cat.free.requiredCredits), total: cat.uniReq.total + cat.free.requiredCredits, sub: lang === "ar" ? "إجبارية + مجموعات + حرة" : "mandatory + groups + free", color: CAT_COLORS[2] },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--color-background)", fontFamily: "var(--font-sans)" }}>

      {/* ── HEADER ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(15,15,15,0.88)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--ds-line-soft, #1a1a1a)",
        padding: "12px 16px 0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "#0007cd",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px rgba(26,38,255,0.4)",
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c0 1.66 4 3 6 3s6-1.34 6-3v-5" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-foreground)", lineHeight: 1.1 }}>{s.header.title}</div>
            <div style={{ fontSize: 10, color: "var(--ds-muted)", fontFamily: "var(--font-mono)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isVisitor ? s.header.visitor : user?.email}
            </div>
          </div>
          <button
            onClick={toggleTheme}
            style={{
              padding: "6px 10px", cursor: "pointer",
              background: "transparent", color: "var(--ds-body, #a8a8a8)",
              border: "1px solid var(--ds-line-strong, #333)",
              borderRadius: 8, fontSize: 13, flexShrink: 0,
            }}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            style={{
              padding: "6px 10px", cursor: "pointer",
              background: "transparent", color: "var(--ds-body, #a8a8a8)",
              border: "1px solid var(--ds-line-strong, #333)",
              borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {lang === "en" ? "ع" : "EN"}
          </button>
          <button
            onClick={signOut}
            style={{
              padding: "6px 10px", cursor: "pointer",
              background: "transparent", color: "var(--ds-body, #a8a8a8)",
              border: "1px solid var(--ds-line-strong, #333)",
              borderRadius: 8, fontSize: 11, fontFamily: "var(--font-sans)", fontWeight: 500,
              display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
            }}
          >
            <LogOut size={11} />
            {isVisitor ? s.header.exit : s.header.signOut}
          </button>
        </div>

        {/* Tab strip */}
        <div className="tab-strip" style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 10 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "7px 10px", flexShrink: 0, cursor: "pointer",
                background: tab === t.key ? "var(--ds-surface-elevated, #222)" : "transparent",
                color: tab === t.key ? "var(--color-foreground)" : "var(--ds-muted, #888)",
                border: tab === t.key ? "1px solid var(--ds-line-strong, #333)" : "1px solid transparent",
                borderRadius: 9999,
                fontSize: 11.5, fontWeight: 500, fontFamily: "var(--font-sans)",
                whiteSpace: "nowrap",
                transition: "all 150ms",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main style={{ maxWidth: 768, margin: "0 auto", padding: "16px 16px 96px" }}>

        {/* Visitor banner */}
        {isVisitor && (
          <div style={{
            marginBottom: 16, padding: "12px 14px",
            background: "rgba(26,38,255,0.08)",
            border: "1px solid rgba(26,38,255,0.25)",
            borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <p style={{ fontSize: 13, color: "var(--ds-body, #a8a8a8)", margin: 0 }}>
              {s.visitor.banner}
            </p>
            <button
              onClick={() => { exitVisitorMode(); window.location.href = "/auth"; }}
              style={{
                padding: "8px 14px", cursor: "pointer",
                background: "#0007cd", color: "#fff",
                border: "none", borderRadius: 8,
                fontSize: 12, fontWeight: 500, fontFamily: "var(--font-sans)",
                boxShadow: "0 0 16px rgba(26,38,255,0.35)",
              }}
            >
              {s.visitor.signUp}
            </button>
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Hero progress ring */}
            <div className="spotlight-glow" style={{
              background: "var(--color-card)",
              border: "1px solid var(--ds-line-soft, #1a1a1a)",
              borderRadius: 16, padding: 20, overflow: "hidden",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <ProgressRing value={overallPct} size={108} stroke={8} label={`${Math.round(overallPct * 100)}%`} sub={s.dashboard.degree_sub} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--ds-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
                    {s.dashboard.degree}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 500, color: "var(--color-foreground)", letterSpacing: "-0.03em", marginTop: 2, lineHeight: 1 }}>
                    {overallDone}
                    <span style={{ color: "var(--ds-muted, #888)", fontSize: 18, marginLeft: 4 }}>/ {overallTotal}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ds-body, #a8a8a8)", marginTop: 4 }}>{s.dashboard.creditsEarned}</div>
                  <div style={{ marginTop: 12 }}>
                    <StackedBar
                      segments={[
                        { value: overallTotal > 0 ? cat.csCore.doneCredits / overallTotal : 0, color: CAT_COLORS[0] },
                        { value: overallTotal > 0 ? Math.min(cat.csElec.doneCredits, cat.csElec.requiredCredits) / overallTotal : 0, color: CAT_COLORS[1] },
                        { value: overallTotal > 0 ? cat.uniReq.done / overallTotal : 0, color: CAT_COLORS[2] },
                        { value: overallTotal > 0 ? Math.min(cat.free.doneCredits, cat.free.requiredCredits) / overallTotal : 0, color: CAT_COLORS[3] },
                        { value: overallTotal > 0 ? (overallTotal - overallDone) / overallTotal : 1, color: "var(--ds-line-strong, #333)" },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Category 2×2 grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {catBlocks.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setTab(c.key)}
                  style={{
                    textAlign: "left", cursor: "pointer",
                    background: "var(--color-card)",
                    border: "1px solid var(--ds-line-soft, #1a1a1a)",
                    borderRadius: 12, padding: 14,
                    display: "flex", flexDirection: "column", gap: 8,
                    fontFamily: "var(--font-sans)",
                    transition: "border-color 150ms",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--ds-line-strong, #333)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--ds-line-soft, #1a1a1a)")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--ds-body, #a8a8a8)", fontWeight: 500 }}>{c.label}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: "var(--color-foreground)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                    {c.done}<span style={{ color: "var(--ds-muted, #888)", fontSize: 14, marginLeft: 2 }}>/{c.total}</span>
                  </div>
                  <MiniBar value={c.total > 0 ? c.done / c.total : 0} color={c.color} />
                  <div style={{ fontSize: 10, color: "var(--ds-muted-soft, #666)", fontFamily: "var(--font-mono)" }}>{c.sub}</div>
                </button>
              ))}
            </div>

            {/* Graduation estimate */}
            <div style={{
              padding: "12px 14px",
              background: "var(--color-card)",
              border: "1px solid var(--ds-line-soft, #1a1a1a)",
              borderRadius: 12,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--ds-surface-elevated, #222)", display: "flex", alignItems: "center", justifyContent: "center", color: "#00d4ff", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-foreground)" }}>
                  {overallDone >= overallTotal ? s.dashboard.degreeComplete : s.dashboard.onTrack}
                </div>
                <div style={{ fontSize: 11, color: "var(--ds-muted, #888)" }}>
                  {overallDone >= overallTotal
                    ? s.dashboard.allDone
                    : s.dashboard.semestersRemain(Math.ceil((overallTotal - overallDone) / 15))}
                </div>
              </div>
            </div>

            {/* What to take next */}
            {suggested.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--ds-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{s.dashboard.whatNext}</div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: "var(--color-foreground)", marginTop: 2 }}>{s.dashboard.unlocked}</div>
                  </div>
                  <div style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 999,
                    background: "var(--ds-surface-elevated, #222)",
                    color: "var(--ds-body, #a8a8a8)", fontFamily: "var(--font-mono)",
                  }}>
                    {suggested.length} {s.dashboard.open}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {suggested.map(renderCard)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CS CORE ── */}
        {tab === "cs_core" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <SectionHeader kicker={s.sections.category} title={s.sections.csCore} meta={`${cat.csCore.doneCredits} / ${cat.csCore.totalCredits} ${s.sections.credits} · ${s.sections.allRequired}`} color={CAT_COLORS[0]} />
            {Array.from({ length: 8 }, (_, i) => i + 1).map((lvl) => {
              const list = cat.csCore.list.filter((c) => c.level_num === lvl);
              if (list.length === 0) return null;
              const doneCr = list.filter((c) => completedCodes.has(c.code)).reduce((s, c) => s + c.credits, 0);
              const totalCr = list.reduce((s, c) => s + c.credits, 0);
              const allDone = doneCr === totalCr && totalCr > 0;
              return (
                <div key={lvl}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: allDone ? "#0007cd" : "var(--ds-surface-elevated, #222)",
                      color: allDone ? "#fff" : "var(--color-foreground)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 600, fontFamily: "var(--font-mono)",
                      boxShadow: allDone ? "0 0 14px rgba(26,38,255,0.45)" : "none",
                    }}>L{lvl}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-foreground)" }}>{s.sections.level} {lvl}</div>
                      <div style={{ fontSize: 11, color: "var(--ds-muted)", fontFamily: "var(--font-mono)" }}>{doneCr} / {totalCr} cr</div>
                    </div>
                    <div style={{ width: 80 }}>
                      <MiniBar value={totalCr > 0 ? doneCr / totalCr : 0} />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {list.map(renderCard)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CS ELECTIVES ── */}
        {tab === "cs_elec" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SectionHeader kicker={s.sections.category} title={s.sections.csElec} meta={`${s.sections.pick} ${cat.csElec.requiredCount} ${s.sections.of} ${cat.csElec.list.length} · ${cat.csElec.doneCount} ${s.sections.chosen}`} color={CAT_COLORS[1]} />
            <PickGroupCard required={cat.csElec.requiredCount} done={cat.csElec.doneCount} credits={`${Math.min(cat.csElec.doneCredits, cat.csElec.requiredCredits)} / ${cat.csElec.requiredCredits} cr`} pct={cat.csElec.requiredCredits > 0 ? Math.min(1, cat.csElec.doneCredits / cat.csElec.requiredCredits) : 0} color={CAT_COLORS[1]} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cat.csElec.list.map(renderCard)}
            </div>
          </div>
        )}

        {/* ── UNIVERSITY REQUIREMENTS ── */}
        {tab === "uni" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <SectionHeader kicker={s.sections.category} title={s.sections.uni} meta={`${cat.uniReq.done} / ${cat.uniReq.total} ${s.sections.credits}`} color={CAT_COLORS[2]} />

            {cat.uniMandatory.list.length > 0 && (
              <div>
                <SubHeading label={s.sections.mandatory} sub={`${cat.uniMandatory.doneCredits} / ${cat.uniMandatory.totalCredits} cr · ${s.sections.mandatorySub}`} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {cat.uniMandatory.list.map(renderCard)}
                </div>
              </div>
            )}

            {cat.uniG.map((g) =>
              g.group ? (
                <div key={g.group.group_id}>
                  <SubHeading label={(lang === "ar" && g.group.name_ar) ? g.group.name_ar : g.group.name} sub={`${s.sections.pick} ${g.requiredCount} · ${g.doneCount} ${s.sections.chosen}`} />
                  <PickGroupCard required={g.requiredCount} done={g.doneCount} credits={`${Math.min(g.doneCredits, g.requiredCredits)} / ${g.requiredCredits} cr`} pct={g.requiredCredits > 0 ? Math.min(1, g.doneCredits / g.requiredCredits) : 0} color={CAT_COLORS[2]} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {g.list.map(renderCard)}
                  </div>
                </div>
              ) : null
            )}

            {/* ── FREE ELECTIVES (merged) ── */}
            <div style={{ borderTop: "1px solid var(--ds-line-soft)", paddingTop: 20 }}>
              <SectionHeader kicker={s.sections.category} title={s.sections.free} meta={`${s.sections.pick} ${cat.free.requiredCount} ${s.sections.of} ${cat.free.list.length} · ${cat.free.doneCount} ${s.sections.chosen}`} color={CAT_COLORS[3]} />
              <div style={{ marginTop: 12 }}>
                <PickGroupCard required={cat.free.requiredCount} done={cat.free.doneCount} credits={`${Math.min(cat.free.doneCredits, cat.free.requiredCredits)} / ${cat.free.requiredCredits} cr`} pct={cat.free.requiredCredits > 0 ? Math.min(1, cat.free.doneCredits / cat.free.requiredCredits) : 0} color={CAT_COLORS[3]} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {cat.free.list.map(renderCard)}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Shared UI components ────────────────────────────────────────────────

function ProgressRing({ value, size, stroke, label, sub }: {
  value: number; size: number; stroke: number; label: string; sub?: string;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(1, value));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#222" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="#1a26ff" strokeWidth={stroke} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 500, color: "var(--color-foreground)", lineHeight: 1, letterSpacing: "-0.04em" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "var(--ds-muted, #888)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>{sub}</div>}
      </div>
    </div>
  );
}

function MiniBar({ value, color = "#1a26ff", height = 4 }: { value: number; color?: string; height?: number }) {
  return (
    <div style={{ width: "100%", height, background: "var(--ds-line-strong, #333)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, value * 100)}%`, height: "100%", background: color, borderRadius: 999, transition: "width 600ms cubic-bezier(0.4,0,0.2,1)" }} />
    </div>
  );
}

function StackedBar({ segments }: { segments: { value: number; color: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 2, height: 6, borderRadius: 999, overflow: "hidden", background: "var(--ds-line-strong, #333)" }}>
      {segments.map((s, i) => (
        <div key={i} style={{ flex: s.value, background: s.color, transition: "flex 600ms cubic-bezier(0.4,0,0.2,1)" }} />
      ))}
    </div>
  );
}

function SectionHeader({ kicker, title, meta, color }: { kicker: string; title: string; meta: string; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: "var(--ds-muted, #888)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>{kicker}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 500, color: "var(--color-foreground)", letterSpacing: "-0.025em", lineHeight: 1.1 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--ds-body, #a8a8a8)", marginTop: 6, fontFamily: "var(--font-mono)" }}>{meta}</div>
    </div>
  );
}

function SubHeading({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-foreground)" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--ds-muted, #888)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PickGroupCard({ required, done, credits, pct, color }: {
  required: number; done: number; credits: string; pct: number; color: string;
}) {
  return (
    <div style={{
      background: "var(--color-card)",
      border: "1px solid var(--ds-line-soft, #1a1a1a)",
      borderRadius: 12, padding: 12, marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: Math.min(required, 12) }).map((_, i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: 3,
              background: i < done ? color : "transparent",
              border: `1.5px solid ${i < done ? color : "var(--ds-line-strong, #333)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: i < done ? `0 0 8px ${color}` : "none",
            }}>
              {i < done && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--ds-muted, #888)", fontFamily: "var(--font-mono)" }}>{credits}</span>
      </div>
      <MiniBar value={pct} color={color} />
    </div>
  );
}
