import { cn } from "@/components/ui/cn";

export interface Span { start: number; end: number; label?: string | null }

/**
 * Renders the immutable response text with evidence spans highlighted. The container's text
 * content is EXACTLY the response text (no extra text nodes), so selection offsets map 1:1.
 */
export function ResponseText({ text, spans, activeIndex, className, containerRef }: { text: string; spans: Span[]; activeIndex?: number | null; className?: string; containerRef?: React.Ref<HTMLDivElement> }) {
  const sorted = spans.map((s, i) => ({ ...s, i })).sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start < cursor) continue; // overlapping spans are not rendered twice
    if (s.start > cursor) parts.push(text.slice(cursor, s.start));
    parts.push(
      <mark key={`${s.start}-${s.i}`} title={s.label ? `Evidence: ${s.label}` : "Evidence"} className={cn("evidence-mark text-ink", activeIndex === s.i && "evidence-mark-active")}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cursor = s.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <div ref={containerRef} className={cn("whitespace-pre-wrap break-words text-[15px] leading-relaxed", className)}>{parts}</div>;
}
