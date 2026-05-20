import { useEffect, useRef, useState } from "react";
import type { Course, CourseStatus } from "@/lib/plannerLogic";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { T } from "@/lib/i18n";

export function CourseCard({
  course,
  status,
  onToggle,
  missingPrereqs = [],
  recentlyUnlocked = false,
  capped = false,
}: {
  course: Course;
  status: CourseStatus;
  onToggle: () => void;
  missingPrereqs?: string[];
  recentlyUnlocked?: boolean;
  capped?: boolean;
}) {
  const { lang } = useLanguage();
  const displayCode = lang === "ar" && course.code_ar ? course.code_ar : course.code;
  const displayName = lang === "ar" && course.name_ar ? course.name_ar : course.name;
  const strings = T[lang].badge;

  const clickable = status !== "locked" && !capped;
  const [pulse, setPulse] = useState(false);
  const lastStatus = useRef(status);

  useEffect(() => {
    if (lastStatus.current !== status && status === "completed") {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 700);
      return () => clearTimeout(t);
    }
    lastStatus.current = status;
  }, [status]);

  const borderColor =
    status === "completed"
      ? "rgba(26,38,255,0.4)"
      : capped
        ? "var(--ds-line-soft)"
        : status === "available"
          ? "var(--ds-line-strong)"
          : "var(--ds-line-soft)";

  const bg =
    status === "completed"
      ? "linear-gradient(180deg, rgba(0,7,205,0.18), rgba(0,7,205,0.05)), var(--color-card)"
      : "var(--color-card)";

  return (
    <div
      role={clickable ? "button" : "presentation"}
      onClick={clickable ? onToggle : undefined}
      className={cn("relative overflow-hidden transition-all duration-150", pulse && "cc-pulse")}
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        padding: "14px 16px",
        cursor: clickable ? "pointer" : "default",
        opacity: status === "locked" || capped ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (clickable)
          (e.currentTarget as HTMLDivElement).style.borderColor =
            status === "completed" ? "var(--ds-blue-glow)" : "var(--color-foreground)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = borderColor;
      }}
    >
      {/* Shimmer overlay on newly unlocked */}
      {recentlyUnlocked && status === "available" && (
        <div className="cc-shimmer absolute inset-0 pointer-events-none" />
      )}

      {/* Blue left rail for completed */}
      {status === "completed" && (
        <div
          className="absolute left-0 top-0 bottom-0"
          style={{ width: 3, background: "var(--ds-blue-glow)", boxShadow: "0 0 12px var(--ds-blue-glow)" }}
        />
      )}

      {/* Top row: code · credits · badge */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-medium whitespace-nowrap"
          style={{
            fontFamily: "var(--font-mono)",
            color: status === "completed" ? "var(--ds-blue-glow)" : "var(--color-foreground)",
            letterSpacing: "0.02em",
          }}
        >
          {displayCode}
        </span>
        <span className="flex-1" />
        <span
          className="text-xs whitespace-nowrap"
          style={{ fontFamily: "var(--font-mono)", color: "var(--ds-muted)" }}
        >
          {course.credits} cr
        </span>
        <StatusBadge status={status} capped={capped} strings={strings} />
      </div>

      {/* Course name */}
      <div
        className="mt-1 text-sm font-medium leading-snug"
        style={{ color: status === "locked" ? "var(--ds-muted)" : "var(--color-foreground)" }}
      >
        {displayName}
      </div>

      {/* Missing prereqs hint */}
      {status === "locked" && missingPrereqs.length > 0 && (
        <div
          className="mt-1.5 text-xs"
          style={{ fontFamily: "var(--font-mono)", color: "var(--ds-muted)" }}
        >
          needs {missingPrereqs.slice(0, 2).join(", ")}
          {missingPrereqs.length > 2 ? ` +${missingPrereqs.length - 2}` : ""}
        </div>
      )}
    </div>
  );
}

const badgeBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: 9999,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

function StatusBadge({ status, capped, strings }: {
  status: CourseStatus; capped?: boolean;
  strings: { done: string; open: string; locked: string; full: string };
}) {
  if (capped && status !== "completed") {
    return (
      <span style={{ ...badgeBase, background: "transparent", color: "var(--ds-muted)", border: "1px solid var(--ds-line-soft)" }}>
        {strings.full}
      </span>
    );
  }

  if (status === "completed") {
    return (
      <span style={{ ...badgeBase, background: "#0007cd", color: "#fff", boxShadow: "0 0 14px rgba(26,38,255,0.45)" }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {strings.done}
      </span>
    );
  }
  if (status === "available") {
    return (
      <span style={{ ...badgeBase, background: "transparent", color: "var(--color-foreground)", border: "1px solid var(--ds-line-strong)" }}>
        {strings.open}
      </span>
    );
  }
  return (
    <span style={{ ...badgeBase, background: "transparent", color: "var(--ds-muted)", border: "1px solid var(--ds-line-soft)" }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {strings.locked}
    </span>
  );
}
