import { Stethoscope } from "lucide-react";

export function Logo({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-pale text-brand" aria-hidden>
        <Stethoscope className="size-5" />
      </span>
      <span>
        <span className="block text-lg font-bold leading-tight tracking-tight text-ink">ClinReview</span>
        {subtitle && <span className="block text-[11px] leading-tight text-ink-2">Medical AI reasoning evaluation</span>}
      </span>
    </div>
  );
}
