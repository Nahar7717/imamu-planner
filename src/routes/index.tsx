import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
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
import { StatCard } from "@/components/StatCard";
import { CourseCard } from "@/components/CourseCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  GraduationCap,
  CheckCircle2,
  Clock,
  BookOpen,
  TrendingUp,
  Sparkles,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Academic Planner" }] }),
});

function Dashboard() {
  const { user, loading, isVisitor, exitVisitorMode } = useAuth();
  const qc = useQueryClient();
  const visitor = useVisitorProgress();

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
      toast.success(r.unmarked ? `Unmarked ${course.code}` : `Completed ${course.code}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const coursesByCode = useMemo(() => {
    const m = new Map<string, Course>();
    for (const c of courses) m.set(c.code, c);
    return m;
  }, [courses]);

  // ===== Per-category progress =====
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

    // University Requirements = uni_mandatory + sum of UNI_G* required
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

  // ===== Overall =====
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
  const overallPct = overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0;

  const availableCount = courses.filter(
    (c) => getCourseStatus(c, completedCodes, prerequisites) === "available",
  ).length;

  const suggested = useMemo(
    () => getSuggestedCourses(courses, completedCodes, prerequisites, 5),
    [courses, completedCodes, prerequisites],
  );

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
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
    />
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold leading-tight">Academic Planner</h1>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="cs_core">CS Core</TabsTrigger>
            <TabsTrigger value="cs_elec">CS Electives</TabsTrigger>
            <TabsTrigger value="uni">University Requirements</TabsTrigger>
            <TabsTrigger value="free">Free Electives</TabsTrigger>
          </TabsList>

          {/* DASHBOARD */}
          <TabsContent value="dashboard" className="space-y-8">
            <Card className="p-6" style={{ background: "var(--gradient-hero)" }}>
              <div className="text-primary-foreground">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-lg font-semibold opacity-90">Overall Credit Progress</h2>
                  <div className="text-3xl font-bold">
                    {overallDone}
                    <span className="opacity-70 text-xl">/{overallTotal}</span>
                  </div>
                </div>
                <Progress value={overallPct} className="h-3 bg-white/20" />
                <p className="mt-2 text-sm opacity-90">{overallPct}% complete</p>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProgressBar
                label="CS Core"
                done={cat.csCore.doneCredits}
                total={cat.csCore.totalCredits}
              />
              <ProgressBar
                label="CS Electives"
                done={Math.min(cat.csElec.doneCredits, cat.csElec.requiredCredits)}
                total={cat.csElec.requiredCredits}
                sub={`${cat.csElec.doneCount}/${cat.csElec.requiredCount} courses`}
              />
              <ProgressBar
                label="University Requirements"
                done={cat.uniReq.done}
                total={cat.uniReq.total}
              />
              <ProgressBar
                label="Free Electives"
                done={Math.min(cat.free.doneCredits, cat.free.requiredCredits)}
                total={cat.free.requiredCredits}
                sub={`${cat.free.doneCount}/${cat.free.requiredCount} courses`}
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Completed credits" value={overallDone} icon={CheckCircle2} accent="success" />
              <StatCard label="Remaining credits" value={Math.max(overallTotal - overallDone, 0)} icon={Clock} accent="locked" />
              <StatCard label="Available courses" value={availableCount} icon={BookOpen} accent="warning" />
              <StatCard label="Progress" value={`${overallPct}%`} icon={TrendingUp} accent="primary" />
            </div>

            {suggested.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-warning" />
                  <h2 className="text-xl font-bold">Suggested next semester</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {suggested.map(renderCard)}
                </div>
              </section>
            )}
          </TabsContent>

          {/* CS CORE — grouped by level_num 1..8 */}
          <TabsContent value="cs_core" className="space-y-6">
            {Array.from({ length: 8 }, (_, i) => i + 1).map((lvl) => {
              const list = cat.csCore.list.filter((c) => c.level_num === lvl);
              if (list.length === 0) return null;
              return (
                <section key={lvl}>
                  <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm">
                      {lvl}
                    </span>
                    Level {lvl}
                    <span className="text-xs text-muted-foreground font-normal">
                      ({list.reduce((s, c) => s + c.credits, 0)} credits)
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {list.map(renderCard)}
                  </div>
                </section>
              );
            })}
          </TabsContent>

          {/* CS ELECTIVES */}
          <TabsContent value="cs_elec" className="space-y-4">
            <Card className="p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-bold">CS Electives</h3>
                <span className="text-sm text-muted-foreground">
                  Pick {cat.csElec.requiredCount} ({cat.csElec.requiredCredits} credits) ·
                  Completed {cat.csElec.doneCount}/{cat.csElec.requiredCount}
                </span>
              </div>
              <Progress
                value={
                  cat.csElec.requiredCredits > 0
                    ? Math.min(
                        100,
                        (cat.csElec.doneCredits / cat.csElec.requiredCredits) * 100,
                      )
                    : 0
                }
              />
            </Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {cat.csElec.list.map(renderCard)}
            </div>
          </TabsContent>

          {/* UNIVERSITY REQUIREMENTS */}
          <TabsContent value="uni" className="space-y-8">
            {cat.uniMandatory.list.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-lg font-bold">Mandatory University Courses</h3>
                  <span className="text-sm text-muted-foreground">
                    {cat.uniMandatory.doneCredits}/{cat.uniMandatory.totalCredits} credits
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {cat.uniMandatory.list.map(renderCard)}
                </div>
              </section>
            )}

            {cat.uniG.map(
              (g) =>
                g.group && (
                  <section key={g.group.group_id}>
                    <Card className="p-4 mb-3">
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 className="font-bold">{g.group.name}</h3>
                        <span className="text-sm text-muted-foreground">
                          Pick {g.requiredCount} ({g.requiredCredits} credits) · Completed{" "}
                          {g.doneCount}/{g.requiredCount}
                        </span>
                      </div>
                      <Progress
                        value={
                          g.requiredCredits > 0
                            ? Math.min(100, (g.doneCredits / g.requiredCredits) * 100)
                            : 0
                        }
                      />
                    </Card>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {g.list.map(renderCard)}
                    </div>
                  </section>
                ),
            )}
          </TabsContent>

          {/* FREE ELECTIVES */}
          <TabsContent value="free" className="space-y-4">
            <Card className="p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-bold">Free Electives</h3>
                <span className="text-sm text-muted-foreground">
                  Pick {cat.free.requiredCount} ({cat.free.requiredCredits} credits) · Completed{" "}
                  {cat.free.doneCount}/{cat.free.requiredCount}
                </span>
              </div>
              <Progress
                value={
                  cat.free.requiredCredits > 0
                    ? Math.min(100, (cat.free.doneCredits / cat.free.requiredCredits) * 100)
                    : 0
                }
              />
            </Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {cat.free.list.map(renderCard)}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ProgressBar({
  label,
  done,
  total,
  sub,
}: {
  label: string;
  done: number;
  total: number;
  sub?: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="font-semibold">{label}</h4>
        <span className="text-sm text-muted-foreground">
          {done}/{total} credits
        </span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
        <span>{pct}%</span>
        {sub && <span>{sub}</span>}
      </div>
    </Card>
  );
}
