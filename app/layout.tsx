import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ClinReview", template: "%s · ClinReview" },
  description: "Medical AI evaluation and labeling workbench (independent portfolio project). For AI evaluation research and education. Not for diagnosis, treatment, or direct patient care.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
