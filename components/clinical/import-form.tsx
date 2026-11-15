"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Copy, Upload } from "lucide-react";
import { commitImportAction, previewImportAction, type ImportRequest } from "@/app/actions/cases";
import { buttonClasses, Field, inputClasses, Notice } from "@/components/ui/primitives";
import type { ImportPreviewRow } from "@/lib/services/cases";

const MAX_BYTES = 1_000_000;

export function ImportForm({ projects, defaultProjectId }: { projects: { id: string; name: string }[]; defaultProjectId?: string }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [request, setRequest] = useState<ImportRequest | null>(null);
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attested, setAttested] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    setRows(null); setError(null); setDone(null); setRequest(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("File is larger than 1 MB. Split it into smaller files.");
    setRequest({ project_id: projectId, file_name: file.name, mime_type: file.type, content: await file.text() });
  };

  const preview = async () => {
    if (!request) return;
    setBusy(true); setError(null); setDone(null);
    const r = await previewImportAction({ ...request, project_id: projectId });
    setBusy(false);
    if (r.ok && r.data) setRows(r.data.rows);
    else if (!r.ok) { setRows(null); setError(r.error); }
  };

  const commit = async () => {
    if (!request) return;
    setBusy(true); setError(null);
    const r = await commitImportAction({ ...request, project_id: projectId }, attested);
    setBusy(false);
    if (r.ok && r.data) { setDone(`Imported ${r.data.imported} case(s); skipped ${r.data.skipped}.`); setRows(null); setRequest(null); router.refresh(); }
    else if (!r.ok) setError(r.error);
  };

  const valid = rows?.filter((r) => r.status === "valid").length ?? 0;
  const status = { valid: { icon: <CheckCircle2 className="size-4 text-ok" aria-hidden />, label: "Valid" }, error: { icon: <CircleAlert className="size-4 text-danger" aria-hidden />, label: "Error" }, duplicate: { icon: <Copy className="size-4 text-warn" aria-hidden />, label: "Duplicate" } };

  return (
    <div className="space-y-5">
      <Notice tone="warn" title="Synthetic data only">Every row is screened for obvious identifiers, but that is a safety net, not de-identification. Never import real patient records.</Notice>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" htmlFor="import-project" required>
          <select id="import-project" value={projectId} onChange={(e) => { setProjectId(e.target.value); setRows(null); }} className={inputClasses}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="File (.csv or .jsonl, up to 1 MB / 200 rows)" htmlFor="import-file" required>
          <input id="import-file" type="file" accept=".csv,.jsonl,.ndjson,text/csv,application/x-ndjson" onChange={(e) => void onFile(e.target.files?.[0])} className={`${inputClasses} py-1.5`} />
        </Field>
      </div>
      <button type="button" className={buttonClasses("secondary")} disabled={!request || busy} onClick={() => void preview()}>{busy && !rows ? "Checking…" : "Preview (dry run)"}</button>

      <div aria-live="polite">
        {error && <Notice tone="danger" title="Cannot import">{error}</Notice>}
        {done && <Notice tone="ok">{done}</Notice>}
      </div>

      {rows && (
        <div className="space-y-3">
          <p className="text-sm"><strong>{valid}</strong> of {rows.length} row(s) valid. Nothing has been saved yet.</p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Import preview</caption>
              <thead className="bg-canvas text-left text-xs text-ink-2"><tr><th className="px-3 py-2 font-medium">Row</th><th className="px-2 py-2 font-medium">Status</th><th className="px-2 py-2 font-medium">Title</th><th className="px-2 py-2 font-medium">Details</th></tr></thead>
              <tbody className="divide-y divide-line align-top">
                {rows.map((r) => (
                  <tr key={r.row}>
                    <td className="px-3 py-2 tabular-nums">{r.row}</td>
                    <td className="px-2 py-2"><span className="flex items-center gap-1">{status[r.status].icon}{status[r.status].label}</span></td>
                    <td className="px-2 py-2">{r.title}{r.caseGroupKey && <span className="block text-xs text-ink-2">group: {r.caseGroupKey}</span>}</td>
                    <td className="px-2 py-2 text-xs">{r.messages.length ? <ul className="list-disc pl-4">{r.messages.map((m, i) => <li key={i}>{m}</li>)}</ul> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {valid > 0 && (
            <div className="space-y-3 rounded-lg border border-line p-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
                <span>I confirm every case in this file is <strong>fully synthetic</strong> and contains no real patient information.</span>
              </label>
              <button type="button" className={buttonClasses("primary")} disabled={!attested || busy} onClick={() => void commit()}>
                <Upload className="size-4" aria-hidden /> {busy ? "Importing…" : `Import ${valid} valid case(s)`}
              </button>
              {valid < rows.length && <p className="text-xs text-ink-2">{rows.length - valid} row(s) with errors or duplicates will be skipped.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
