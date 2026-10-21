import React from "react";
import "@/styles/globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

export const metadata = {
  title: "Enterprise Knowledge Assistant | Grounded RAG Workspace",
  description: "Free-first, provider-independent enterprise retrieval and grounded question answering."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
