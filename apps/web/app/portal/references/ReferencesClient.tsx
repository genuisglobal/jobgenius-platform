"use client";

import { useState } from "react";

interface Reference {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  relationship: string;
}

const RELATIONSHIP_OPTIONS = [
  { value: "manager", label: "Manager" },
  { value: "colleague", label: "Colleague" },
  { value: "mentor", label: "Mentor" },
  { value: "other", label: "Other" },
];

export default function ReferencesClient({
  initialReferences,
}: {
  initialReferences: Reference[];
}) {
  const [references, setReferences] = useState<Reference[]>(initialReferences);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    title: "",
    company: "",
    email: "",
    phone: "",
    relationship: "other",
  });

  const resetForm = () => {
    setForm({ name: "", title: "", company: "", email: "", phone: "", relationship: "other" });
  };

  const addReference = async () => {
    if (!form.name.trim()) {
      setMessage({ type: "error", text: "Name is required." });
      return;
    }
    setAdding(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to add." });
        return;
      }
      const { reference } = await res.json();
      setReferences((r) => [...r, reference]);
      resetForm();
      setMessage({ type: "success", text: "Reference added!" });
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setAdding(false);
    }
  };

  const deleteReference = async (id: string) => {
    setDeleting(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/portal/references?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        setMessage({ type: "error", text: "Failed to delete." });
        return;
      }
      setReferences((r) => r.filter((ref) => ref.id !== id));
      setMessage({ type: "success", text: "Reference removed." });
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Professional References</h2>
        <p className="text-gray-600 mt-1">
          Add up to 10 professional references. We recommend at least 3.
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {references.length < 3 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          You have {references.length} reference{references.length !== 1 ? "s" : ""}. Add{" "}
          {3 - references.length} more to earn the &quot;Reference Champion&quot; badge!
        </div>
      )}

      {/* Existing References */}
      {references.map((ref) => (
        <div key={ref.id} className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{ref.name}</h3>
              {ref.title && (
                <p className="text-sm text-gray-600">
                  {ref.title}
                  {ref.company && ` at ${ref.company}`}
                </p>
              )}
              <div className="mt-2 space-y-1">
                {ref.email && (
                  <p className="text-sm text-gray-500">{ref.email}</p>
                )}
                {ref.phone && (
                  <p className="text-sm text-gray-500">{ref.phone}</p>
                )}
              </div>
              <span className="inline-block mt-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 capitalize">
                {ref.relationship}
              </span>
            </div>
            <button
              onClick={() => deleteReference(ref.id)}
              disabled={deleting === ref.id}
              className="text-red-500 hover:text-red-700 text-sm disabled:opacity-50"
            >
              {deleting === ref.id ? "Deleting..." : "Remove"}
            </button>
          </div>
        </div>
      ))}

      {/* Add Form */}
      {references.length < 10 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Reference</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
              <select
                value={form.relationship}
                onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              >
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={addReference}
            disabled={adding}
            className="mt-4 px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add Reference"}
          </button>
        </div>
      )}
    </div>
  );
}
