export type CourseType =
  | "cs_core"
  | "cs_elective"
  | "uni_mandatory"
  | "uni_group"
  | "free_elective";

export type Course = {
  code: string;
  name: string;
  name_ar: string | null;
  code_ar: string | null;
  credits: number;
  course_type: CourseType;
  level_num: number | null;
  notes?: string | null;
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
  limit = 8,
): Course[] {
  const isAvailable = (c: Course) =>
    getCourseStatus(c, completedCodes, prerequisites) === "available";
  const byLevel = (a: Course, b: Course) =>
    (a.level_num ?? 99) - (b.level_num ?? 99);

  const core = courses
    .filter((c) => c.course_type === "cs_core" && isAvailable(c))
    .sort(byLevel);

  const elec = courses
    .filter((c) => c.course_type === "cs_elective" && isAvailable(c))
    .sort(byLevel);

  const uni = courses
    .filter((c) => (c.course_type === "uni_mandatory" || c.course_type === "uni_group") && isAvailable(c))
    .sort(byLevel);

  return [...core, ...elec, ...uni].slice(0, limit);
}
