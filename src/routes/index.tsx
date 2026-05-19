import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getCourseStatus,
  getSuggestedCourses,
  type Course,
  type Prerequisite,
  type CourseStatus,
} from "@/lib/plannerLogic";
import { StatCard } from "@/components/StatCard";
import { CourseCard } from "@/components/CourseCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { GraduationCap, CheckCircle2, Clock, BookOpen, TrendingUp, Sparkles, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Academic Planner" }] }),
});

type Filter = "all" | "completed" | "available" | "locked";

function Dashboard() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!loading && !user) window.location.href = "/auth";
  }, [user, loading]);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").order("group_num").order("code");
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
    () => new Set(progress.filter((p) => p.status === "completed").map((p) => p.course_code)),
    [progress],
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

  const totalCredits = courses.reduce((s, c) => s + c.credits, 0);
  const completedCredits = courses.filter((c) => completedCodes.has(c.code)).reduce((s, c) => s + c.credits, 0);
  const remainingCredits = totalCredits - completedCredits;
  const availableCount = courses.filter(
    (c) => getCourseStatus(c, completedCodes, prerequisites) === "available",
  ).length;
  const progressPct = totalCredits > 0 ? Math.round((completedCredits / totalCredits) * 100) : 0;

  const suggested = useMemo(
    () => getSuggestedCourses(courses, completedCodes, prerequisites, 5),
    [courses, completedCodes, prerequisites],
  );

  const semesters = useMemo(() => {
    const map = new Map<number, Course[]>();
    for (let i = 1; i <= 10; i++) map.set(i, []);
    for (const c of courses) {
      const g = c.group_num ?? 0;
      if (g >= 1 && g <= 10) map.get(g)!.push(c);
    }
    return map;
  }, [courses]);

  const filterCourse = (c: Course): boolean => {
    if (filter === "all") return true;
    return getCourseStatus(c, completedCodes, prerequisites) === filter;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

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
        {/* Progress */}
        <Card className="p-6" style={{ background: "var(--gradient-hero)" }}>
          <div className="text-primary-foreground">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold opacity-90">Credit Hour Progress</h2>
              <div className="text-3xl font-bold">{completedCredits}<span className="opacity-70 text-xl">/{totalCredits}</span></div>
            </div>
            <Progress value={progressPct} className="h-3 bg-white/20" />
            <p className="mt-2 text-sm opacity-90">{progressPct}% complete</p>
          </div>
        </Card>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Completed credits" value={completedCredits} icon={CheckCircle2} accent="success" />
          <StatCard label="Remaining credits" value={remainingCredits} icon={Clock} accent="locked" />
          <StatCard label="Available courses" value={availableCount} icon={BookOpen} accent="warning" />
          <StatCard label="Progress" value={`${progressPct}%`} icon={TrendingUp} accent="primary" />
        </div>

        {/* Suggested */}
        {suggested.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-warning" />
              <h2 className="text-xl font-bold">Suggested next semester</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {suggested.map((c) => (
                <CourseCard
                  key={c.code}
                  course={c}
                  status={getCourseStatus(c, completedCodes, prerequisites)}
                  onToggle={() => toggle.mutate(c)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {(["all", "completed", "available", "locked"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>

        {/* Semester grid */}
        <div className="space-y-6">
          {Array.from(semesters.entries()).map(([sem, list]) => {
            const filtered = list.filter(filterCourse);
            if (list.length === 0) return null;
            return (
              <section key={sem}>
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm">
                    {sem}
                  </span>
                  Semester {sem}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({list.reduce((s, c) => s + c.credits, 0)} credits)
                  </span>
                </h3>
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No courses match filter.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filtered.map((c) => {
                      const status: CourseStatus = getCourseStatus(c, completedCodes, prerequisites);
                      return (
                        <CourseCard key={c.code} course={c} status={status} onToggle={() => toggle.mutate(c)} />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
