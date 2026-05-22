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

  const bg =
    status === "completed"
      ? "rgba(249,115,22,0.07)"
      : "rgba(255,255,255,0.03)";

  return (
    <div
      role={clickable ? "button" : "presentation"}
      onClick={clickable ? onToggle : undefined}
      className={cn("relative overflow-hidden transition-all duration-150", pulse && "cc-pulse")}
      style={{
        background: bg,
        border: "1px solid rgba(255,255,255,0.06)",
        borderInlineStart: status === "available" ? "2px solid #f97316"
          : status === "completed" ? "2px solid #f97316"
          : "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "13px 16px",
        cursor: clickable ? "pointer" : "default",
        opacity: status === "locked" || capped ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (clickable)
          (e.currentTarget as HTMLDivElement).style.background =
            status === "completed" ? "rgba(249,115,22,0.1)" : "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = bg;
      }}
    >
      {/* Shimmer overlay on newly unlocked */}
      {recentlyUnlocked && status === "available" && (
        <div className="cc-shimmer absolute inset-0 pointer-events-none" />
      )}

      {/* Single row: [code + name] | [! prereqs] [cr] [badge] */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
            color: status === "completed" ? "#f97316" : "#52525b",
            letterSpacing: "0.02em", flexShrink: 0, minWidth: 52,
          }}>
            {displayCode}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 400,
            color: status === "locked" || capped ? "#52525b" : "#e4e4e7",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayName}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Prereq tooltip — only on locked courses with missing prereqs */}
          {status === "locked" && missingPrereqs.length > 0 && (
            <PrereqTooltip prereqs={missingPrereqs} lang={lang} />
          )}
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            background: "rgba(255,255,255,0.05)", color: "#71717a",
            padding: "2px 8px", borderRadius: 4,
          }}>
            {course.credits} cr
          </span>
          <StatusBadge status={status} capped={capped} strings={strings} />
        </div>
      </div>
    </div>
  );
}

// ── Prereq tooltip ──────────────────────────────────────────────────────────

function PrereqTooltip({ prereqs, lang }: { prereqs: string[]; lang: string }) {
  const [visible, setVisible] = useState(false);
  const label = lang === "ar" ? "المتطلبات السابقة" : "Prerequisites";

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {/* The ! badge */}
      <div style={{
        width: 18, height: 18, borderRadius: "50%",
        background: "rgba(234,179,8,0.12)",
        border: "1px solid rgba(234,179,8,0.35)",
        color: "#eab308",
        fontSize: 11, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "help", flexShrink: 0,
        userSelect: "none",
      }}>
        !
      </div>

      {/* Tooltip */}
      {visible && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          insetInlineEnd: 0,
          background: "#1c1c22",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          padding: "10px 12px",
          minWidth: 180,
          zIndex: 100,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          pointerEvents: "none",
        }}>
          {/* Arrow */}
          <div style={{
            position: "absolute",
            bottom: -5, insetInlineEnd: 6,
            width: 8, height: 8,
            background: "#1c1c22",
            border: "1px solid rgba(255,255,255,0.1)",
            borderTop: "none", borderInlineStart: "none",
            transform: "rotate(45deg)",
          }} />

          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "#eab308",
            marginBottom: 7,
          }}>
            {label}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {prereqs.map((code) => (
              <div key={code} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(234,179,8,0.5)", flexShrink: 0 }} />
                <span style={{
                  fontSize: 11, fontFamily: "var(--font-mono)",
                  color: "#e4e4e7", fontWeight: 500,
                }}>
                  {code}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status badge ────────────────────────────────────────────────────────────

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
      <span style={{ ...badgeBase, background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff", boxShadow: "0 0 12px rgba(249,115,22,0.4)" }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {strings.done}
      </span>
    );
  }
  if (status === "available") {
    return (
      <span style={{ ...badgeBase, background: "rgba(249,115,22,0.1)", color: "#f97316", border: "1px solid rgba(249,115,22,0.25)" }}>
        {strings.open}
      </span>
    );
  }
  return (
    <span style={{ ...badgeBase, background: "rgba(255,255,255,0.03)", color: "var(--ds-muted, #52525b)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {strings.locked}
    </span>
  );
}
