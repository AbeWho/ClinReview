import { STATUS_LABELS, type TaskStatus } from "@/lib/workflow/task-status";
import { Badge, humanize } from "./primitives";

const TASK_TONES: Record<TaskStatus, Parameters<typeof Badge>[0]["tone"]> = {
  queued: "neutral", in_progress: "info", in_review: "brand", changes_requested: "warn", adjudication: "violet", finalized: "ok",
};
export function TaskStatusChip({ status }: { status: TaskStatus }) {
  return <Badge tone={TASK_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function VerdictChip({ verdict }: { verdict: string | null | undefined }) {
  const tone = verdict === "correct" ? "ok" : verdict === "partially_correct" ? "warn" : verdict === "incorrect" ? "danger" : "neutral";
  return <Badge tone={tone}>{verdict ? humanize(verdict) : "No verdict"}</Badge>;
}

export function SeverityChip({ severity }: { severity: string | null | undefined }) {
  const tone = severity === "critical" || severity === "high" ? "danger" : severity === "moderate" ? "warn" : severity === "low" ? "info" : "neutral";
  return <Badge tone={tone}>Severity: {severity ? humanize(severity) : "—"}</Badge>;
}

export function DecisionChip({ decision }: { decision: string }) {
  const tone = decision === "approve" ? "ok" : decision === "needs_changes" ? "warn" : "danger";
  const label = decision === "approve" ? "Approved" : decision === "needs_changes" ? "Changes requested" : "Rejected";
  return <Badge tone={tone}>{label}</Badge>;
}

export function PriorityChip({ priority }: { priority: string }) {
  const tone = priority === "urgent" ? "danger" : priority === "high" ? "warn" : "neutral";
  return <Badge tone={tone}>{humanize(priority)} priority</Badge>;
}
