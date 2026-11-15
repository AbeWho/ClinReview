"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/server/context";
import { buttonClasses } from "./primitives";
import { cn } from "./cn";

type Action = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

/**
 * A form wired to a server action. Shows pending state, success and error messages
 * (announced to screen readers), and optionally asks for confirmation first.
 */
export function ActionForm({ action, children, className, confirmMessage, resetOnSuccess }: { action: Action; children: ReactNode; className?: string; confirmMessage?: string; resetOnSuccess?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
      <FormStatus state={state} />
    </form>
  );
}

export function FormStatus({ state }: { state: ActionResult<unknown> | null }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {state && !state.ok && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger-pale px-3 py-2 text-sm text-ink" role="alert">
          <p className="font-medium text-danger">{state.error}</p>
          {state.fieldErrors && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {Object.entries(state.fieldErrors).flatMap(([k, msgs]) => msgs.map((m, i) => <li key={`${k}-${i}`}>{m}</li>))}
            </ul>
          )}
        </div>
      )}
      {state?.ok && state.message && <p className="mt-3 rounded-lg border border-ok/25 bg-ok-pale px-3 py-2 text-sm text-ok">{state.message}</p>}
    </div>
  );
}

export function SubmitButton({ children, variant = "primary", size, className, pendingLabel = "Saving…", name, value }: { children: ReactNode; variant?: Parameters<typeof buttonClasses>[0]; size?: "sm" | "md"; className?: string; pendingLabel?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-disabled={pending} className={cn(buttonClasses(variant, size), className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}
