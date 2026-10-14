"use client";

import { useState } from "react";

export const US_CANADA_LOCATIONS = [
  "Anywhere in USA", "Anywhere in Canada",
  "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Phoenix, AZ",
  "Philadelphia, PA", "San Antonio, TX", "San Diego, CA", "Dallas, TX", "San Jose, CA",
  "Austin, TX", "Jacksonville, FL", "Fort Worth, TX", "Columbus, OH", "Charlotte, NC",
  "San Francisco, CA", "Indianapolis, IN", "Seattle, WA", "Denver, CO", "Washington, DC",
  "Nashville, TN", "Oklahoma City, OK", "El Paso, TX", "Boston, MA", "Portland, OR",
  "Las Vegas, NV", "Memphis, TN", "Louisville, KY", "Baltimore, MD", "Milwaukee, WI",
  "Albuquerque, NM", "Tucson, AZ", "Fresno, CA", "Mesa, AZ", "Sacramento, CA",
  "Atlanta, GA", "Kansas City, MO", "Omaha, NE", "Raleigh, NC", "Miami, FL",
  "Cleveland, OH", "Tampa, FL", "Minneapolis, MN", "Pittsburgh, PA", "Cincinnati, OH",
  "Richmond, TX", "Salt Lake City, UT",
  // Canada
  "Toronto, ON", "Montreal, QC", "Vancouver, BC", "Calgary, AB", "Edmonton, AB",
  "Ottawa, ON", "Winnipeg, MB", "Quebec City, QC", "Hamilton, ON", "Halifax, NS",
];

export default function LocationMultiSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const filtered = US_CANADA_LOCATIONS.filter(
    (loc) => loc.toLowerCase().includes(search.toLowerCase()) && !selected.includes(loc)
  ).slice(0, 10);

  const addLocation = (loc: string) => {
    if (!selected.includes(loc)) onChange([...selected, loc]);
    setSearch("");
    setShowDropdown(false);
  };

  const addCustom = () => {
    const val = customInput.trim();
    if (val && !selected.includes(val)) {
      onChange([...selected, val]);
    }
    setCustomInput("");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map((loc) => (
          <span
            key={loc}
            className="inline-flex items-center gap-1 px-3 py-1 bg-violet-100 text-violet-800 rounded-full text-sm"
          >
            {loc}
            <button onClick={() => onChange(selected.filter((l) => l !== loc))} className="hover:text-violet-600">&times;</button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search US & Canada cities..."
          className="w-full px-3 py-2 border border-gray-400 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
        />
        {showDropdown && filtered.length > 0 && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
            <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filtered.map((loc) => (
                <button
                  key={loc}
                  onClick={() => addLocation(loc)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-900 hover:bg-violet-50 transition-colors"
                >
                  {loc}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
          placeholder="Or type a custom location..."
          className="flex-1 px-3 py-2 border border-gray-400 rounded-lg text-sm bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
        />
        <button onClick={addCustom} className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">Add</button>
      </div>
    </div>
  );
}
