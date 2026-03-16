"use client";

export default function GlassToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 p-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 rounded-xl transition-all text-left"
    >
      <div className="min-w-0">
        <p className="text-sm text-white/80">{label}</p>
        {description && (
          <p className="text-xs text-white/35 mt-0.5">{description}</p>
        )}
      </div>
      {/* Toggle track */}
      <div
        className={`relative shrink-0 w-10 h-5.5 rounded-full transition-colors duration-200 ${
          checked
            ? "bg-teal-500/40 border-teal-400/50"
            : "bg-white/10 border-white/10"
        } border`}
      >
        {/* Toggle knob */}
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
            checked
              ? "left-5 bg-teal-300"
              : "left-0.5 bg-white/40"
          }`}
        />
      </div>
    </button>
  );
}
