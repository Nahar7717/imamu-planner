import type { Course, Prerequisite, ElectiveGroup, ElectiveGroupCourse } from "./plannerLogic";

export type PlannedTerm = {
  index: number;            // 1-based term number from now
  courses: Course[];
  credits: number;
};

export type GraduationPlan = {
  terms: PlannedTerm[];
  totalRemainingCredits: number;
  // Courses that still need prereqs we could never satisfy (data gap / cycle).
  blocked: Course[];
};

export type PlanOptions = {
  maxCredits?: number;   // hard cap per term
  minCredits?: number;   // preferred floor per term
  softTarget?: number;   // stop adding once a term reaches this
  maxTerms?: number;     // safety guard
};

const ELECTIVE_GROUP_IDS = ["CS_ELEC", "FREE", "UNI_G1", "UNI_G2", "UNI_G3", "UNI_G4", "UNI_G5"];

/**
 * Build a term-by-term path to graduation.
 *
 * Follows the base plan order (by level_num) but adapts to whatever the student
 * has already completed — so transfer/off-plan students get a valid forward path
 * that respects prerequisites. Each term targets `softTarget` credits, never
 * exceeds `maxCredits`, and aims for at least `minCredits` when enough courses
 * are eligible.
 */
export function buildGraduationPlan(
  courses: Course[],
  prerequisites: Prerequisite[],
  groups: ElectiveGroup[],
  groupCourses: ElectiveGroupCourse[],
  completedCodes: Set<string>,
  opts: PlanOptions = {},
): GraduationPlan {
  const maxCredits = opts.maxCredits ?? 19;
  const minCredits = opts.minCredits ?? 12;
  const softTarget = opts.softTarget ?? 16;
  const maxTerms = opts.maxTerms ?? 20;

  const byCode = new Map(courses.map((c) => [c.code, c]));
  const prereqsOf = (code: string) =>
    prerequisites.filter((p) => p.course_code === code).map((p) => p.prereq_code);

  // Which elective group (if any) a course belongs to.
  const groupOfCourse = new Map<string, string>();
  for (const gc of groupCourses) {
    if (ELECTIVE_GROUP_IDS.includes(gc.group_id)) groupOfCourse.set(gc.course_code, gc.group_id);
  }

  // Remaining credit need per elective group (required − already completed).
  const electiveNeed = new Map<string, number>();
  for (const gid of ELECTIVE_GROUP_IDS) {
    const g = groups.find((x) => x.group_id === gid);
    if (!g) continue;
    const memberCodes = groupCourses.filter((gc) => gc.group_id === gid).map((gc) => gc.course_code);
    const doneCredits = memberCodes
      .map((c) => byCode.get(c))
      .filter((c): c is Course => !!c && completedCodes.has(c.code))
      .reduce((s, c) => s + c.credits, 0);
    const need = Math.max(0, g.required_credits - doneCredits);
    if (need > 0) electiveNeed.set(gid, need);
  }

  // Mandatory individual courses still needed (core + university-mandatory).
  const mandatoryNeeded = new Set(
    courses
      .filter(
        (c) =>
          !completedCodes.has(c.code) &&
          !groupOfCourse.has(c.code) &&
          (c.course_type === "cs_core" || c.course_type === "uni_mandatory"),
      )
      .map((c) => c.code),
  );

  const completed = new Set(completedCodes);
  const scheduled = new Set<string>(); // elective courses already placed
  const terms: PlannedTerm[] = [];
  const byLevel = (a: Course, b: Course) => (a.level_num ?? 99) - (b.level_num ?? 99);
  const prereqsMet = (code: string) => prereqsOf(code).every((p) => completed.has(p));

  let guard = 0;
  while ((mandatoryNeeded.size > 0 || electiveNeed.size > 0) && guard < maxTerms) {
    guard++;
    const term: Course[] = [];
    let credits = 0;

    const tryAdd = (c: Course): boolean => {
      if (credits + c.credits > maxCredits) return false;
      term.push(c);
      credits += c.credits;
      return true;
    };

    // 1) Mandatory courses first (lower levels unlock prereq chains), by level.
    const eligibleMandatory = [...mandatoryNeeded]
      .map((code) => byCode.get(code))
      .filter((c): c is Course => !!c && prereqsMet(c.code))
      .sort(byLevel);

    for (const c of eligibleMandatory) {
      if (credits >= softTarget) break;
      if (tryAdd(c)) mandatoryNeeded.delete(c.code);
    }

    // 2) Fill remaining room with electives from groups that still need credits.
    if (credits < softTarget) {
      const eligibleElectives = courses
        .filter(
          (c) =>
            !completed.has(c.code) &&
            !scheduled.has(c.code) &&
            groupOfCourse.has(c.code) &&
            (electiveNeed.get(groupOfCourse.get(c.code)!) ?? 0) > 0 &&
            prereqsMet(c.code),
        )
        .sort(byLevel);

      for (const c of eligibleElectives) {
        if (credits >= softTarget) break;
        const gid = groupOfCourse.get(c.code)!;
        if ((electiveNeed.get(gid) ?? 0) <= 0) continue;
        if (tryAdd(c)) {
          scheduled.add(c.code);
          const left = (electiveNeed.get(gid) ?? 0) - c.credits;
          if (left > 0) electiveNeed.set(gid, left);
          else electiveNeed.delete(gid);
        }
      }
    }

    // Nothing could be scheduled though work remains → unresolved prereqs.
    if (term.length === 0) break;

    for (const c of term) completed.add(c.code);
    terms.push({ index: terms.length + 1, courses: term, credits });
  }

  // Anything mandatory still stuck after the loop is blocked by missing prereqs.
  const blocked = [...mandatoryNeeded]
    .map((code) => byCode.get(code))
    .filter((c): c is Course => !!c);

  const totalRemainingCredits = terms.reduce((s, t) => s + t.credits, 0);
  return { terms, totalRemainingCredits, blocked };
}
