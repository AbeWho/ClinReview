export const DISCLAIMER = "For AI evaluation research and education. Not for diagnosis, treatment, or direct patient care.";

export function DisclaimerBar() {
  return (
    <div className="border-b border-warn/20 bg-warn-pale px-4 py-1.5 text-center text-xs text-ink" role="note">
      <strong className="font-semibold">Educational tool.</strong> {DISCLAIMER} Synthetic data only. Do not enter real patient information.
    </div>
  );
}
