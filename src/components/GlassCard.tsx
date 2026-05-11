"use client";

import { ReactNode } from "react";

export default function GlassCard({
  children,
  className = "",
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "strong" | "soft";
}) {
  const base =
    variant === "strong" ? "glass-strong" : variant === "soft" ? "glass-soft" : "glass";
  return <div className={`${base} ${className}`}>{children}</div>;
}
