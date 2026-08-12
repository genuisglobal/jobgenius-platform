"use client";

import { useState } from "react";
import type { ContactRow } from "./NetworkClient";

interface EditContactFormProps {
  contact: ContactRow;
  onClose: () => void;
  onSaved: (contact: ContactRow) => void;
}

export default function EditContactForm({
  contact,
  onClose,
  onSaved,
}: EditContactFormProps) {
  const [contactType, setContactType] = useState<"recruiter" | "referral">(
    contact.contact_type
  );
  const [fullName, setFullName] = useState(contact.full_name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(contact.linkedin_url ?? "");
  const [companyName, setCompanyName] = useState(contact.company_name ?? "");
  const [jobTitle, setJobTitle] = useState(contact.job_title ?? "");
  const [industriesText, setIndustriesText] = useState(
    (contact.industries ?? []).join(", ")
  );
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [status, setStatus] = useState<"active" | "inactive" | "do_not_contact">(
    contact.status as "active" | "inactive" | "do_not_contact"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError("");

    const industries = industriesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/am/network/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_type: contactType,
          full_name: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          linkedin_url: linkedinUrl.trim() || undefined,
          company_name: companyName.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          industries: industries.length > 0 ? industries : [],
          notes: notes.trim() || undefined,
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update contact.");
      }

      const data = await res.json();
      onSaved({ ...data.contact, pending_match_count: contact.pending_match_count });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Edit Contact</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Contact Type Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Type
            </label>
            <div className="flex gap-2">
              {(["recruiter", "referral"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setContactType(type)}
                  className={`px-4 py-2 text-sm rounded-lg border transition ${
                    contactType === type
                      ? "bg-violet-50 border-violet-300 text-violet-700 font-medium"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Jane Smith"
            />
          </div>

          {/* Email + Phone row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="+1 555-0123"
              />
            </div>
          </div>

          {/* LinkedIn */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LinkedIn URL
            </label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="https://linkedin.com/in/janesmith"
            />
          </div>

          {/* Company + Job Title row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="Google"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="Senior Recruiter"
              />
            </div>
          </div>

          {/* Industries */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Industries{" "}
              <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={industriesText}
              onChange={(e) => setIndustriesText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Software Engineering, Data Science"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "active" | "inactive" | "do_not_contact")
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="do_not_contact">Do Not Contact</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              placeholder="Any additional notes..."
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
