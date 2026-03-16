// ─── Root Layout ───────────────────────────────────────────
// Imports global styles and the Thaana font for Dhivehi output.

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Creative Network News Desk",
  description: "AI-Powered Dhivehi News Engine — Internal Agency Tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Load Noto Sans Thaana for Dhivehi text rendering */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thaana:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
