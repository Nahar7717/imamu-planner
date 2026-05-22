// Course types — kept generic so new majors can reuse the same values.
// cs_core / cs_elective are legacy names for the CS major; new majors
// should use the same enum values (core, elective, etc.) — extend as needed.
export type CourseType =
  | "cs_core"
  | "cs_elective"
  | "uni_mandatory"
  | "uni_group"
  | "free_elective"
  | string; // allows future majors to define their own types

export type College = {
  id: string;
  name: string;
  name_ar: string | null;
};

export type Major = {
  id: string;
  college_id: string;
  name: string;
  name_ar: string | null;
  total_credits: number;
};

export type Course = {
  code: string;
  name: string;
  name_ar: string | null;
  code_ar: string | null;
  credits: number;
  course_type: CourseType;
  level_num: number | null;
  notes?: string | null;
  major_id: string | null;
};

export type Prerequisite = { course_code: string; prereq_code: string };

export type ElectiveGroup = {
  group_id: string;
  name: string;
  name_ar: string | null;
  required_count: number;
  required_credits: number;
};

export type ElectiveGroupCourse = { group_id: string; course_code: string };

export type CourseStatus = "completed" | "available" | "locked";

export function getCourseStatus(
  course: Course,
  completedCodes: Set<string>,
  prerequisites: Prerequisite[],
): CourseStatus {
  if (completedCodes.has(course.code)) return "completed";
  const prereqs = prerequisites
    .filter((p) => p.course_code === course.code)
    .map((p) => p.prereq_code);
  if (prereqs.every((p) => completedCodes.has(p))) return "available";
  return "locked";
}

export function getSuggestedCourses(
  courses: Course[],
  completedCodes: Set<string>,
  prerequisites: Prerequisite[],
  remaining: { core: number; elec: number; uni: number },
  limit = 8,
): Course[] {
  const isAvailable = (c: Course) =>
    getCourseStatus(c, completedCodes, prerequisites) === "available";
  const byLevel = (a: Course, b: Course) =>
    (a.level_num ?? 99) - (b.level_num ?? 99);

  // Only pull from categories that still need credits
  const corePool = remaining.core > 0
    ? courses.filter((c) => c.course_type === "cs_core" && isAvailable(c)).sort(byLevel)
    : [];
  const elecPool = remaining.elec > 0
    ? courses.filter((c) => c.course_type === "cs_elective" && isAvailable(c)).sort(byLevel)
    : [];
  const uniPool = remaining.uni > 0
    ? courses.filter((c) => (c.course_type === "uni_mandatory" || c.course_type === "uni_group") && isAvailable(c)).sort(byLevel)
    : [];

  // Allocate slots proportionally to remaining credits
  const total = remaining.core + remaining.elec + remaining.uni || 1;
  const slots = (rem: number) =>
    rem > 0 ? Math.max(1, Math.round((rem / total) * limit)) : 0;

  const coreSlots = slots(remaining.core);
  const elecSlots = slots(remaining.elec);
  const uniSlots  = slots(remaining.uni);

  return [
    ...corePool.slice(0, coreSlots),
    ...elecPool.slice(0, elecSlots),
    ...uniPool.slice(0, uniSlots),
  ].slice(0, limit);
}
