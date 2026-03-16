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
      className="w-full flex items-center justify-between gap-3 p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all text-left"
    >
      <div className="min-w-0">
        <p className="text-sm text-gray-700">{label}</p>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      {/* Toggle track */}
      <div
        className={`relative shrink-0 w-10 h-5.5 rounded-full transition-colors duration-200 ${
          checked
            ? "bg-blue-500 border-blue-500"
            : "bg-gray-200 border-gray-200"
        } border`}
      >
        {/* Toggle knob */}
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
            checked
              ? "left-5 bg-white"
              : "left-0.5 bg-white"
          }`}
        />
      </div>
    </button>
  );
}
