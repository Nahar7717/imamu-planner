export type CourseType =
  | "cs_core"
  | "cs_elective"
  | "uni_mandatory"
  | "uni_group"
  | "free_elective";

export type Course = {
  code: string;
  name: string;
  credits: number;
  course_type: CourseType;
  level_num: number | null;
  notes?: string | null;
};

export type Prerequisite = { course_code: string; prereq_code: string };

export type ElectiveGroup = {
  group_id: string;
  name: string;
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
  limit = 5,
): Course[] {
  return courses
    .filter((c) => c.course_type === "cs_core")
    .filter((c) => getCourseStatus(c, completedCodes, prerequisites) === "available")
    .sort((a, b) => (a.level_num ?? 99) - (b.level_num ?? 99))
    .slice(0, limit);
}
