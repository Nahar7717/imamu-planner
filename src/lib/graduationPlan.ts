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

// A generated elective slot has code `__<groupId>_SLOT_<n>`.
export const isElectiveSlot = (code: string) => code.startsWith("__") && code.includes("_SLOT_");
export const slotGroupId = (code: string): string | null =>
  isElectiveSlot(code) ? code.slice(2).replace(/_SLOT_\d+$/, "") : null;

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

  // Elective requirements are shown as generic "pick one from <category>" slots,
  // not specific courses — the student chooses which course fills each slot.
  const electiveSlots: Course[] = [];
  for (const gid of ELECTIVE_GROUP_IDS) {
    const g = groups.find((x) => x.group_id === gid);
    if (!g) continue;
    const memberCodes = groupCourses.filter((gc) => gc.group_id === gid).map((gc) => gc.course_code);
    const members = memberCodes.map((c) => byCode.get(c)).filter((c): c is Course => !!c);
    const doneCredits = members
      .filter((c) => completedCodes.has(c.code))
      .reduce((s, c) => s + c.credits, 0);
    let need = Math.max(0, g.required_credits - doneCredits);
    if (need <= 0) continue;
    // Typical credits per course in this group → slot size.
    const typical = g.required_count > 0
      ? Math.max(1, Math.round(g.required_credits / g.required_count))
      : (members[0]?.credits ?? 3);
    let i = 0;
    while (need > 0) {
      const cr = Math.min(typical, need);
      electiveSlots.push({
        code: `__${gid}_SLOT_${i++}`,
        code_ar: null,
        name: g.name,
        name_ar: g.name_ar,
        credits: cr,
        course_type: "elective_slot",
        level_num: 99, // scheduled after mandatory courses
        major_id: null,
      });
      need -= cr;
    }
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
  const terms: PlannedTerm[] = [];
  const byLevel = (a: Course, b: Course) => (a.level_num ?? 99) - (b.level_num ?? 99);
  const prereqsMet = (code: string) => prereqsOf(code).every((p) => completed.has(p));

  let slotIdx = 0; // next elective slot to place

  let guard = 0;
  while ((mandatoryNeeded.size > 0 || slotIdx < electiveSlots.length) && guard < maxTerms) {
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

    // 2) Fill remaining room with generic elective slots (no prereqs).
    while (slotIdx < electiveSlots.length && credits < softTarget) {
      if (!tryAdd(electiveSlots[slotIdx])) break; // wouldn't fit under the cap
      slotIdx++;
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
