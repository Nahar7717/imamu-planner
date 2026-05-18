import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Lock, Circle } from "lucide-react";
import type { Course, CourseStatus } from "@/lib/plannerLogic";
import { cn } from "@/lib/utils";

const statusConfig: Record<CourseStatus, { label: string; className: string; icon: typeof Check }> = {
  completed: { label: "Completed", className: "bg-success text-success-foreground", icon: Check },
  available: { label: "Available", className: "bg-warning text-warning-foreground", icon: Circle },
  locked: { label: "Locked", className: "bg-locked text-locked-foreground", icon: Lock },
};

export function CourseCard({
  course,
  status,
  onToggle,
}: {
  course: Course;
  status: CourseStatus;
  onToggle: () => void;
}) {
  const cfg = statusConfig[status];
  const Icon = cfg.icon;
  const clickable = status !== "locked";
  return (
    <Card
      onClick={clickable ? onToggle : undefined}
      className={cn(
        "p-4 transition-all border-2",
        clickable && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
        status === "completed" && "border-success/40 bg-success/5",
        status === "available" && "border-warning/40",
        status === "locked" && "border-border opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-mono font-bold text-primary">{course.code}</span>
        <Badge className={cfg.className}>
          <Icon className="w-3 h-3 mr-1" />
          {cfg.label}
        </Badge>
      </div>
      <h3 className="font-semibold text-sm leading-snug mb-2">{course.name}</h3>
      <div className="text-xs text-muted-foreground">{course.credits} credits</div>
    </Card>
  );
}
