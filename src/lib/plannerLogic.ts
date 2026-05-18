export type Course = {
  code: string;
  name: string;
  credits: number;
  group_num: number | null;
  is_uni_req: boolean;
  is_elective: boolean;
  notes?: string | null;
};

export type Prerequisite = { course_code: string; prereq_code: string };

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
    .filter((c) => getCourseStatus(c, completedCodes, prerequisites) === "available")
    .sort((a, b) => (a.group_num ?? 99) - (b.group_num ?? 99))
    .slice(0, limit);
}
