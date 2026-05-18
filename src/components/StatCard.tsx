import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent: "primary" | "success" | "warning" | "locked";
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    locked: "bg-locked/15 text-locked",
  } as const;
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accentMap[accent]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      </div>
    </Card>
  );
}
