"use client";

export default function MultiCheckbox({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
            selected.includes(opt.value)
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-gray-800 border-gray-400 hover:border-violet-500"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
