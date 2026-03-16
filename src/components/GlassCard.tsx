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
      className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}
    >
      {children}
    </div>
  );
}
