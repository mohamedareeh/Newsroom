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
      className="w-full flex items-center justify-between gap-3 p-3 bg-[#f5f3f0] hover:bg-[#ece9e4] border border-gray-200/60 rounded-xl transition-all duration-200 text-left"
    >
      <div className="min-w-0">
        <p className="text-sm text-gray-700 font-medium">{label}</p>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      {/* Toggle track */}
      <div
        className={`relative shrink-0 w-11 h-6 rounded-full transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          checked
            ? "bg-[#1a1a1a]"
            : "bg-gray-200"
        }`}
      >
        {/* Toggle knob */}
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </div>
    </button>
  );
}
