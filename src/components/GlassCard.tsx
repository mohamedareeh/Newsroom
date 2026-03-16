"use client";

import { ReactNode } from "react";

export default function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl rounded-3xl ${className}`}
    >
      {children}
    </div>
  );
}
