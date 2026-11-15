"use client";

import { Notice, buttonClasses } from "@/components/ui/primitives";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Notice tone="danger" title="Something went wrong">
        <p>{error.message.includes("not found") || error.message.includes("permission") ? error.message : "The page could not be loaded. Your saved work is not affected."}</p>
        {error.digest && <p className="mt-1 text-xs text-ink-2">Reference: {error.digest}</p>}
      </Notice>
      <button type="button" onClick={reset} className={`${buttonClasses("secondary")} mt-4`}>Try again</button>
    </div>
  );
}
