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
  type Major,
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
const CAT_COLORS = ["#8b5cf6", "#06b6d4", "#f97316", "#ec4899"] as const;

function Dashboard() {
  const { user, loading, isVisitor, exitVisitorMode } = useAuth();
  const { lang, setLang, isRtl } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const s = t(lang);
  const qc = useQueryClient();
  const visitor = useVisitorProgress();
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [recentUnlocks, setRecentUnlocks] = useState(new Set<string>());
  const [pendingCourse, setPendingCourse] = useState<Course | null>(null);
  const [pendingGrade, setPendingGrade] = useState("");
  const [pendingSemester, setPendingSemester] = useState("");

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
      return data as { course_code: string; status: string; grade: string | null; semester_taken: string | null }[];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from("profiles") as any)
        .select("major_id, is_admin, full_name")
        .eq("id", user!.id)
        .single();
      if (error) return null;
      return data as { major_id: string | null; is_admin: boolean; full_name: string | null };
    },
  });

  const { data: major } = useQuery({
    queryKey: ["major", profile?.major_id],
    enabled: !!profile?.major_id,
    queryFn: async () => {
      const { data, error } = await (supabase.from("majors") as any)
        .select("*")
        .eq("id", profile!.major_id)
        .single();
      if (error) return null;
      return data as Major;
    },
  });

  // Active major id — visitors default to 'cs'
  const activeMajorId = isVisitor ? "cs" : (profile?.major_id ?? "cs");

  // Filter everything to the user's active major
  const majorCourses = useMemo(
    () => courses.filter((c) => !c.major_id || c.major_id === activeMajorId),
    [courses, activeMajorId],
  );

  const completedCodes = useMemo(
    () =>
      isVisitor
        ? visitor.completedCodes
        : new Set(progress.filter((p) => p.status === "completed").map((p) => p.course_code)),
    [progress, isVisitor, visitor.completedCodes],
  );

  const toggle = useMutation({
    mutationFn: async ({ course, grade, semester }: { course: Course; grade?: string | null; semester?: string | null }) => {
      if (isVisitor) {
        const was = visitor.completedCodes.has(course.code);
        visitor.toggle(course.code);
        return { unmarked: was, course };
      }
      if (!user) throw new Error("Not authenticated");
      if (completedCodes.has(course.code)) {
        const { error } = await supabase
          .from("student_progress")
          .delete()
          .eq("student_id", user.id)
          .eq("course_code", course.code);
        if (error) throw error;
        return { unmarked: true, course };
      } else {
        const { error } = await supabase.from("student_progress").upsert(
          {
            student_id: user.id,
            course_code: course.code,
            status: "completed",
            grade: grade || null,
            semester_taken: semester || null,
          },
          { onConflict: "student_id,course_code" },
        );
        if (error) throw error;
        return { unmarked: false, course };
      }
    },
    onSuccess: ({ unmarked, course }) => {
      qc.invalidateQueries({ queryKey: ["progress", user?.id] });
      toast.success(unmarked ? `${lang === "ar" ? "تم إلغاء" : "Unmarked"} ${course.code}` : `${lang === "ar" ? "اكتمل" : "Completed"} ${course.code}`);
      if (!unmarked) {
        // Find newly unlocked courses
        const newCompleted = new Set(completedCodes);
        newCompleted.add(course.code);
        const unlocked = new Set(
          majorCourses
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

  // Map from course_code → full progress entry (for grade/semester display)
  const progressMap = useMemo(() => {
    const m = new Map<string, { course_code: string; status: string; grade: string | null; semester_taken: string | null }>();
    for (const p of progress) m.set(p.course_code, p);
    return m;
  }, [progress]);

  // GPA calculation — Saudi 5-point scale
  const GPA_POINTS: Record<string, number> = { A: 5.0, "B+": 4.5, B: 4.0, "C+": 3.5, C: 3.0, "D+": 2.5, D: 2.0, F: 0.0 };
  const { gpa, gradedCount, gradedCredits } = useMemo(() => {
    if (isVisitor) return { gpa: null, gradedCount: 0, gradedCredits: 0 };
    let totalPoints = 0, totalCredits = 0, count = 0;
    for (const entry of progress) {
      if (entry.status === "completed" && entry.grade && GPA_POINTS[entry.grade] !== undefined) {
        const course = coursesByCode.get(entry.course_code);
        if (course) {
          totalPoints += GPA_POINTS[entry.grade] * course.credits;
          totalCredits += course.credits;
          count++;
        }
      }
    }
    if (totalCredits === 0) return { gpa: null, gradedCount: 0, gradedCredits: 0 };
    return { gpa: totalPoints / totalCredits, gradedCount: count, gradedCredits: totalCredits };
  }, [progress, coursesByCode, isVisitor]);

  // Semester options — First/Second/Summer from 2018 to next year
  const semesterOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
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
  }, [lang]);

  const getMissingPrereqs = useCallback(
    (course: Course) =>
      prerequisites
        .filter((p) => p.course_code === course.code && !completedCodes.has(p.prereq_code))
        .map((p) => p.prereq_code),
    [prerequisites, completedCodes],
  );

  const getAllPrereqs = useCallback(
    (course: Course) =>
      prerequisites
        .filter((p) => p.course_code === course.code)
        .map((p) => {
          const c = coursesByCode.get(p.prereq_code);
          return { code: p.prereq_code, code_ar: c?.code_ar ?? null };
        }),
    [prerequisites, coursesByCode],
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
        const doneCredits = majorCourses
          .filter((c) => memberCodes.includes(c.code) && completedCodes.has(c.code))
          .reduce((s, c) => s + c.credits, 0);
        if (doneCredits >= group.required_credits) return true;
      }
      return false;
    },
    [groupCourses, groups, majorCourses, completedCodes],
  );

  const cat = useMemo(() => {
    const csCore = majorCourses.filter((c) => c.course_type === "cs_core");
    const uniMandatory = majorCourses.filter((c) => c.course_type === "uni_mandatory");

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
  }, [majorCourses, groups, groupCourses, coursesByCode, completedCodes]);

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
    () => getSuggestedCourses(majorCourses, completedCodes, prerequisites, {
      core: Math.max(0, cat.csCore.totalCredits - cat.csCore.doneCredits),
      elec: Math.max(0, cat.csElec.requiredCredits - cat.csElec.doneCredits),
      uni:  Math.max(0, cat.uniReq.total - cat.uniReq.done),
    }),
    [majorCourses, completedCodes, prerequisites, cat],
  );

  const signOut = async () => {
    if (isVisitor) {
      exitVisitorMode();
    } else {
      await supabase.auth.signOut();
    }
    window.location.href = "/auth";
  };

  if ((loading && !isVisitor) || (!user && !isVisitor)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-background)", color: "var(--ds-muted)" }}>
        Loading…
      </div>
    );
  }

  // Logged-in user hasn't picked a major yet → show picker
  if (user && profile && !profile.major_id) {
    return <MajorPicker userId={user.id} lang={lang} />;
  }

  const renderCard = (c: Course) => {
    const status = getCourseStatus(c, completedCodes, prerequisites);
    const entry = progressMap.get(c.code);
    return (
      <CourseCard
        key={c.code}
        course={c}
        status={status}
        onToggle={() => {
          if (completedCodes.has(c.code)) {
            // Unmark directly — no modal needed
            toggle.mutate({ course: c });
          } else {
            // Open modal to optionally capture grade + semester
            setPendingCourse(c);
            setPendingGrade("");
            setPendingSemester("");
          }
        }}
        grade={entry?.grade ?? null}
        semester={entry?.semester_taken ?? null}
        missingPrereqs={getMissingPrereqs(c)}
        allPrereqs={getAllPrereqs(c)}
        recentlyUnlocked={recentUnlocks.has(c.code)}
        capped={isCourseCapped(c)}
      />
    );
  };

  const catBlocks = [
    { key: "cs_core" as TabKey, label: s.sections.csCore, icon: "💻", done: cat.csCore.doneCredits, total: cat.csCore.totalCredits, sub: `${cat.csCore.done} / ${cat.csCore.total} ${s.sections.courses} · ${cat.csCore.totalCredits} ${s.sections.credits}`, color: CAT_COLORS[0], bg: "rgba(139,92,246,0.07)", borderColor: "rgba(139,92,246,0.2)" },
    { key: "cs_elec" as TabKey, label: s.sections.csElec, icon: "⚡", done: Math.min(cat.csElec.doneCredits, cat.csElec.requiredCredits), total: cat.csElec.requiredCredits, sub: `${cat.csElec.list.length} ${s.sections.courses} · ${s.sections.pick} ${cat.csElec.requiredCount}`, color: CAT_COLORS[1], bg: "rgba(6,182,212,0.07)", borderColor: "rgba(6,182,212,0.2)" },
    { key: "uni" as TabKey, label: s.sections.uni, icon: "🏛", done: cat.uniReq.done + Math.min(cat.free.doneCredits, cat.free.requiredCredits), total: cat.uniReq.total + cat.free.requiredCredits, sub: lang === "ar" ? "إجبارية + مجموعات + حرة" : "mandatory + groups + free", color: CAT_COLORS[2], bg: "rgba(249,115,22,0.07)", borderColor: "rgba(249,115,22,0.2)" },
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
            background: "linear-gradient(135deg, #f97316, #ec4899)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 16px rgba(249,115,22,0.45)",
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c0 1.66 4 3 6 3s6-1.34 6-3v-5" />
            </svg>
          </div>
          <div
            style={{ flex: 1, minWidth: 0, cursor: (!isVisitor && user) ? "pointer" : "default" }}
            onClick={() => { if (!isVisitor && user) window.location.href = "/profile"; }}
            title={(!isVisitor && user) ? (lang === "ar" ? "الملف الشخصي" : "Edit profile") : undefined}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-foreground)", lineHeight: 1.1 }}>{s.header.title}</div>
            <div style={{ fontSize: 10, color: "var(--ds-muted)", fontFamily: "var(--font-mono)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isVisitor ? s.header.visitor : (profile?.full_name || user?.email)}
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
          {profile?.is_admin && (
            <a
              href="/admin"
              style={{
                padding: "6px 10px", cursor: "pointer",
                background: "transparent", color: "var(--ds-body, #a8a8a8)",
                border: "1px solid var(--ds-line-strong, #333)",
                borderRadius: 8, fontSize: 11, fontFamily: "var(--font-sans)", fontWeight: 500,
                display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
                textDecoration: "none",
              }}
              title="Admin Panel"
            >
              ⚙️ Admin
            </a>
          )}
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
        <div className="tab-strip" style={{ display: "flex", gap: 0, overflowX: "auto", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 16px", flexShrink: 0, cursor: "pointer",
                background: "transparent",
                color: tab === t.key ? "#f97316" : "var(--ds-muted, #52525b)",
                border: "none",
                borderBottom: tab === t.key ? "2px solid #f97316" : "2px solid transparent",
                borderRadius: 0,
                fontSize: 12, fontWeight: 500, fontFamily: "var(--font-sans)",
                whiteSpace: "nowrap",
                transition: "all 150ms",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main style={{ maxWidth: 840, margin: "0 auto", padding: "22px 20px 96px" }}>

        {/* Visitor banner */}
        {isVisitor && (
          <div style={{
            marginBottom: 16, padding: "12px 14px",
            background: "rgba(249,115,22,0.07)",
            border: "1px solid rgba(249,115,22,0.2)",
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
                background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff",
                border: "none", borderRadius: 8,
                fontSize: 12, fontWeight: 500, fontFamily: "var(--font-sans)",
                boxShadow: "0 0 16px rgba(249,115,22,0.35)",
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
            <div style={{
              background: "linear-gradient(135deg, #18181b 0%, #1c1017 50%, #1a1018 100%)",
              border: "1px solid rgba(249,115,22,0.15)",
              borderRadius: 16, padding: "22px 24px", overflow: "hidden", position: "relative",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-foreground)", marginBottom: 3 }}>
                    {s.dashboard.degree}
                  </div>
                  <div style={{ fontSize: 12, color: "#71717a", marginBottom: 14 }}>
                    {overallDone} {lang === "ar" ? "من" : "of"} {overallTotal} {s.dashboard.creditsEarned}
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden", marginBottom: 5 }}>
                    <div style={{ width: `${Math.min(100, Math.round(overallPct * 100))}%`, height: "100%", background: "linear-gradient(90deg, #f97316, #ec4899)", borderRadius: 99, transition: "width 600ms cubic-bezier(0.4,0,0.2,1)" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#52525b" }}>
                    {overallDone >= overallTotal
                      ? s.dashboard.degreeComplete
                      : `${s.dashboard.onTrack} · ${s.dashboard.semestersRemain(Math.ceil((overallTotal - overallDone) / 19))}`}
                  </div>
                </div>
                <ProgressRing value={overallPct} size={76} stroke={7} label={`${Math.round(overallPct * 100)}%`} sub={s.dashboard.degree_sub} />
              </div>
            </div>

            {/* GPA card — shown for logged-in users once they have completed courses */}
            {!isVisitor && completedCodes.size > 0 && (
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, padding: "16px 20px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", marginBottom: 4 }}>
                    {lang === "ar" ? "المعدل التراكمي" : "Cumulative GPA"}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: "var(--color-foreground)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                    {gpa !== null ? gpa.toFixed(2) : "—"}
                    <span style={{ fontSize: 13, color: "var(--ds-muted)", fontWeight: 400, marginLeft: 6 }}>/ 5.00</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ds-muted)", marginTop: 5 }}>
                    {gpa !== null
                      ? `${gradedCount} ${lang === "ar" ? "مقرر مُقيَّم" : "graded courses"} · ${gradedCredits} ${lang === "ar" ? "ساعة" : "credits"}`
                      : (lang === "ar" ? "سجّل درجاتك عند إكمال المقررات" : "Log grades when marking courses done")}
                  </div>
                </div>
                <div style={{
                  width: 54, height: 54, borderRadius: "50%", flexShrink: 0,
                  background: gpa === null ? "rgba(255,255,255,0.04)" : gpa >= 4.5 ? "rgba(34,197,94,0.1)" : gpa >= 3.0 ? "rgba(249,115,22,0.1)" : "rgba(239,68,68,0.1)",
                  border: `2px solid ${gpa === null ? "rgba(255,255,255,0.08)" : gpa >= 4.5 ? "rgba(34,197,94,0.3)" : gpa >= 3.0 ? "rgba(249,115,22,0.3)" : "rgba(239,68,68,0.3)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: gpa === null ? 22 : 18, fontWeight: 700,
                  color: gpa === null ? "var(--ds-muted)" : gpa >= 4.5 ? "#22c55e" : gpa >= 3.0 ? "#f97316" : "#ef4444",
                }}>
                  {gpa === null ? "?" : gpa >= 4.75 ? "A" : gpa >= 4.25 ? "B+" : gpa >= 3.75 ? "B" : gpa >= 3.25 ? "C+" : gpa >= 2.75 ? "C" : gpa >= 2.25 ? "D+" : gpa >= 1.5 ? "D" : "F"}
                </div>
              </div>
            )}

            {/* Category 3-column cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {catBlocks.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setTab(c.key)}
                  style={{
                    textAlign: isRtl ? "right" : "left", cursor: "pointer",
                    background: c.bg,
                    border: `1px solid ${c.borderColor}`,
                    borderRadius: 12, padding: "16px 18px",
                    display: "flex", flexDirection: "column",
                    fontFamily: "var(--font-sans)",
                    transition: "border-color 150ms",
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{c.icon}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: c.color, marginBottom: 6 }}>{c.label}</div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: "var(--color-foreground)", lineHeight: 1 }}>{c.done}</span>
                    <span style={{ fontSize: 13, color: "var(--ds-muted, #71717a)" }}> / {c.total}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ds-muted, #71717a)", marginBottom: 10 }}>{c.sub}</div>
                  <MiniBar value={c.total > 0 ? c.done / c.total : 0} color={c.color} height={3} />
                </button>
              ))}
            </div>

            {/* What to take next */}
            {suggested.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#71717a" }}>
                    {s.dashboard.whatNext} — {s.dashboard.unlocked}
                  </span>
                  <span style={{ fontSize: 10, background: "rgba(249,115,22,0.1)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 99, padding: "2px 10px", fontWeight: 600 }}>
                    {suggested.length} {s.dashboard.open}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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
                      background: allDone ? "linear-gradient(135deg, #f97316, #ec4899)" : "rgba(255,255,255,0.05)",
                      color: allDone ? "#fff" : "var(--ds-muted, #71717a)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 600, fontFamily: "var(--font-mono)",
                      boxShadow: allDone ? "0 0 14px rgba(249,115,22,0.4)" : "none",
                    }}>L{lvl}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-foreground)" }}>{s.sections.level} {lvl}</div>
                      <div style={{ fontSize: 11, color: "var(--ds-muted)", fontFamily: "var(--font-mono)" }}>{doneCr} / {totalCr} cr</div>
                    </div>
                    <div style={{ width: 80 }}>
                      <MiniBar value={totalCr > 0 ? doneCr / totalCr : 0} />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                {cat.free.list.map(renderCard)}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Completion Modal (grade + semester) ── */}
      {pendingCourse && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setPendingCourse(null)}
        >
          <div
            style={{ background: "var(--color-card, #111)", border: "1px solid var(--ds-line-strong, #2a2a2a)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 340 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Course info */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ds-muted)", marginBottom: 4 }}>
                {lang === "ar" ? "تسجيل إكمال المقرر" : "Mark as Completed"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-foreground)" }}>
                {lang === "ar" && pendingCourse.name_ar ? pendingCourse.name_ar : pendingCourse.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--ds-muted)", fontFamily: "var(--font-mono)", marginTop: 3 }}>
                {lang === "ar" && pendingCourse.code_ar ? pendingCourse.code_ar : pendingCourse.code} · {pendingCourse.credits} {lang === "ar" ? "ساعة" : "cr"}
              </div>
            </div>

            {/* Semester */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", marginBottom: 6 }}>
                {lang === "ar" ? "الفصل الدراسي (اختياري)" : "Semester (optional)"}
              </div>
              <select
                value={pendingSemester}
                onChange={(e) => setPendingSemester(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", background: "var(--ds-canvas-deep, #000)", color: "var(--color-foreground)", border: "1px solid var(--ds-line-strong, #333)", borderRadius: 8, fontSize: 13, fontFamily: "var(--font-sans)", outline: "none" }}
              >
                <option value="">{lang === "ar" ? "— اختر الفصل —" : "— Select semester —"}</option>
                {semesterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Grade */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", marginBottom: 8 }}>
                {lang === "ar" ? "الدرجة (اختياري)" : "Grade (optional)"}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["A", "B+", "B", "C+", "C", "D+", "D", "F"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setPendingGrade(pendingGrade === g ? "" : g)}
                    style={{
                      padding: "6px 12px", cursor: "pointer",
                      border: `1px solid ${pendingGrade === g ? "#f97316" : "var(--ds-line-strong, #333)"}`,
                      background: pendingGrade === g ? "rgba(249,115,22,0.15)" : "transparent",
                      color: pendingGrade === g ? "#f97316" : "var(--ds-muted)",
                      borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: "var(--font-mono)",
                      transition: "all 120ms",
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { toggle.mutate({ course: pendingCourse, grade: null, semester: null }); setPendingCourse(null); }}
                style={{ flex: 1, padding: "10px 0", cursor: "pointer", background: "transparent", color: "var(--ds-muted)", border: "1px solid var(--ds-line-strong, #333)", borderRadius: 8, fontSize: 13, fontFamily: "var(--font-sans)" }}
              >
                {lang === "ar" ? "تخطي" : "Skip"}
              </button>
              <button
                onClick={() => { toggle.mutate({ course: pendingCourse, grade: pendingGrade || null, semester: pendingSemester || null }); setPendingCourse(null); }}
                style={{ flex: 2, padding: "10px 0", cursor: "pointer", background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)", boxShadow: "0 0 20px rgba(249,115,22,0.3)" }}
              >
                {lang === "ar" ? "تسجيل الإكمال" : "Mark Done"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const gradId = "ring-grad";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={`url(#${gradId})`} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 2 }}>
        <div style={{
          fontSize: 20, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em",
          background: "linear-gradient(135deg, #f97316, #ec4899)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>{label}</div>
        {sub && <div style={{ fontSize: 9, color: "var(--ds-muted, #71717a)", letterSpacing: "0.06em", fontWeight: 500, maxWidth: size - stroke * 4, lineHeight: 1.3 }}>{sub}</div>}
      </div>
    </div>
  );
}

function MiniBar({ value, color = "#f97316", height = 4 }: { value: number; color?: string; height?: number }) {
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

// ─── Major Picker (shown when user has no major_id set) ──────────────────────

function MajorPicker({ userId, lang }: { userId: string; lang: string }) {
  const qc = useQueryClient();
  const [selectedCollege, setSelectedCollege] = useState("");
  const [selectedMajor, setSelectedMajor] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: colleges = [] } = useQuery({
    queryKey: ["colleges"],
    queryFn: async () => {
      const { data } = await (supabase.from("colleges") as any).select("*").order("name");
      return data as { id: string; name: string; name_ar: string | null }[];
    },
  });

  const { data: majors = [] } = useQuery({
    queryKey: ["majors"],
    queryFn: async () => {
      const { data } = await (supabase.from("majors") as any).select("*").order("name");
      return data as { id: string; college_id: string; name: string; name_ar: string | null }[];
    },
  });

  const filteredMajors = selectedCollege
    ? majors.filter((m) => m.college_id === selectedCollege)
    : majors;

  const save = async () => {
    if (!selectedMajor) return;
    setSaving(true);
    await (supabase.from("profiles") as any).upsert(
      { id: userId, major_id: selectedMajor },
      { onConflict: "id" },
    );
    qc.invalidateQueries({ queryKey: ["profile", userId] });
    setSaving(false);
  };

  const isAr = lang === "ar";

  return (
    <div className="spotlight-glow" style={{
      minHeight: "100vh", background: "var(--color-background)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 24px",
    }}>
      <div style={{
        width: "100%", maxWidth: 360,
        background: "var(--color-card)",
        border: "1px solid var(--ds-line-strong, #333)",
        borderRadius: 16, padding: 24,
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: "linear-gradient(135deg, #f97316, #ec4899)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 0 24px rgba(249,115,22,0.4)",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1.66 4 3 6 3s6-1.34 6-3v-5" />
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--color-foreground)", marginBottom: 6 }}>
            {isAr ? "اختر تخصصك" : "Choose your major"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ds-muted)" }}>
            {isAr ? "سيتم تحميل خطتك الدراسية بناءً على تخصصك" : "Your study plan will load based on your major"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* College selector */}
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--ds-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
              {isAr ? "الكلية" : "College"}
            </span>
            <select
              value={selectedCollege}
              onChange={(e) => { setSelectedCollege(e.target.value); setSelectedMajor(""); }}
              style={{
                width: "100%", padding: "10px 12px",
                background: "#000", color: selectedCollege ? "var(--color-foreground)" : "var(--ds-muted)",
                border: "1px solid var(--ds-line-strong, #333)",
                borderRadius: 8, fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", appearance: "none",
              }}
            >
              <option value="">{isAr ? "اختر الكلية" : "Select college"}</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>{isAr && c.name_ar ? c.name_ar : c.name}</option>
              ))}
            </select>
          </label>

          {/* Major selector */}
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--ds-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
              {isAr ? "التخصص" : "Major"}
            </span>
            <select
              value={selectedMajor}
              onChange={(e) => setSelectedMajor(e.target.value)}
              disabled={filteredMajors.length === 0}
              style={{
                width: "100%", padding: "10px 12px",
                background: "#000", color: selectedMajor ? "var(--color-foreground)" : "var(--ds-muted)",
                border: "1px solid var(--ds-line-strong, #333)",
                borderRadius: 8, fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", appearance: "none",
                opacity: filteredMajors.length === 0 ? 0.5 : 1, cursor: filteredMajors.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              <option value="">{isAr ? "اختر التخصص" : "Select major"}</option>
              {filteredMajors.map((m) => (
                <option key={m.id} value={m.id}>{isAr && m.name_ar ? m.name_ar : m.name}</option>
              ))}
            </select>
          </label>

          <button
            onClick={save}
            disabled={!selectedMajor || saving}
            style={{
              marginTop: 4, padding: "12px 16px", border: "none",
              background: selectedMajor ? "linear-gradient(135deg, #f97316, #ec4899)" : "rgba(255,255,255,0.06)",
              color: selectedMajor ? "#fff" : "var(--ds-muted)",
              borderRadius: 8, fontSize: 14, fontWeight: 500, fontFamily: "var(--font-sans)",
              cursor: selectedMajor ? "pointer" : "not-allowed",
              boxShadow: selectedMajor ? "0 0 24px rgba(249,115,22,0.4)" : "none",
              transition: "all 200ms",
            }}
          >
            {saving ? (isAr ? "جارٍ الحفظ…" : "Saving…") : (isAr ? "ابدأ التخطيط ←" : "Start planning →")}
          </button>
        </div>
      </div>
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
