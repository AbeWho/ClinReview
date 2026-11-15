import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-ink-2">This record does not exist, or your role does not have access to it.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand underline">Back to dashboard</Link>
    </main>
  );
}
