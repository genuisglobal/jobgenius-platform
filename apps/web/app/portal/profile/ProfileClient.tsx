"use client";

import { useState, useRef, useCallback } from "react";
import GmailConnect from "./GmailConnect";
import MultiCheckbox from "../components/MultiCheckbox";
import BooleanToggle from "../components/BooleanToggle";
import LocationMultiSelect, { US_CANADA_LOCATIONS } from "../components/LocationMultiSelect";
import Field from "../components/Field";
import { RESUME_TEMPLATES } from "@/lib/resume-templates/types";
import type { ResumeTemplateId } from "@/lib/resume-templates/types";

// ─── Types ─────────────────────────────────────────────────────

interface WorkEntry {
  title: string;
  company: string;
  start_date: string;
  end_date: string;
  current: boolean;
  description: string;
}

interface EducationEntry {
  degree: string;
  school: string;
  field: string;
  graduation_year: string;
}

interface LocationPreference {
  work_type: "remote" | "hybrid" | "onsite";
  locations: string[];
}

interface ProfileData {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  address_line1?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  address_country?: string;
  seniority?: string;
  work_type?: string;
  work_type_preferences?: string[];
  employment_type_preferences?: string[];
  salary_min?: number;
  salary_max?: number;
  target_titles?: string[];
  skills?: string[];
  work_history?: WorkEntry[];
  education?: EducationEntry[];
  years_experience?: number;
  preferred_industries?: string[];
  preferred_company_sizes?: string[];
  preferred_locations?: string[];
  location_preferences?: LocationPreference[];
  open_to_relocation?: boolean;
  // Work authorization
  requires_visa_sponsorship?: boolean;
  authorized_to_work?: boolean;
  visa_status?: string;
  citizenship_status?: string;
  requires_h1b_transfer?: boolean;
  needs_employer_sponsorship?: boolean;
  // Availability
  start_date?: string;
  notice_period?: string;
  available_for_relocation?: boolean;
  available_for_travel?: boolean;
  willing_to_work_overtime?: boolean;
  willing_to_work_weekends?: boolean;
  preferred_shift?: string;
  minimum_salary?: number;
  open_to_contract?: boolean;
  // EEO
  eeo_gender?: string;
  eeo_race?: string;
  eeo_veteran_status?: string;
  eeo_disability_status?: string;
  // Background
  felony_conviction?: boolean;
  non_compete_subject?: boolean;
  consent_background_check?: boolean;
  consent_drug_screening?: boolean;
  // Resume
  resume_template_id?: ResumeTemplateId;
}

interface DocRecord {
  id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

// ─── Constants ─────────────────────────────────────────────────


const WORK_TYPE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "temporary", label: "Temporary" },
];

// ─── Section Completion ────────────────────────────────────────

function sectionComplete(section: string, profile: ProfileData): boolean {
  switch (section) {
    case "Personal":
      return !!(profile.full_name && profile.phone && profile.location);
    case "Preferences":
      return !!(
        profile.seniority &&
        (profile.target_titles?.length ?? 0) > 0 &&
        (profile.salary_min || profile.salary_max)
      );
    case "Skills":
      return (profile.skills?.length ?? 0) > 0;
    case "Work":
      return (profile.work_history?.length ?? 0) > 0 &&
        profile.work_history!.some((e) => e.title && e.company);
    case "Education":
      return (profile.education?.length ?? 0) > 0 &&
        profile.education!.some((e) => e.degree && e.school);
    case "Authorization":
      return profile.authorized_to_work !== undefined && profile.citizenship_status !== undefined && !!profile.citizenship_status;
    case "Availability":
      return !!(profile.start_date && profile.notice_period);
    case "EEO":
      return !!(profile.eeo_gender || profile.eeo_race || profile.eeo_veteran_status || profile.eeo_disability_status);
    case "Background":
      return profile.consent_background_check !== undefined;
    default:
      return false;
  }
}

// ─── Components ────────────────────────────────────────────────

function SectionStatusBadge({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
      Incomplete
    </span>
  );
}

function Section({
  title,
  description,
  children,
  saving,
  onSave,
  complete,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  saving: boolean;
  onSave: () => void;
  complete?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            {complete !== undefined && <SectionStatusBadge complete={complete} />}
          </div>
          {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {children}
    </div>
  );
}


const WORK_TYPE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

function LocationPreferencesEditor({
  preferences,
  onChange,
}: {
  preferences: LocationPreference[];
  onChange: (prefs: LocationPreference[]) => void;
}) {
  const addEntry = () => {
    onChange([...preferences, { work_type: "remote", locations: ["Anywhere in USA"] }]);
  };

  const removeEntry = (index: number) => {
    onChange(preferences.filter((_, i) => i !== index));
  };

  const updateWorkType = (index: number, workType: "remote" | "hybrid" | "onsite") => {
    const updated = [...preferences];
    updated[index] = { ...updated[index], work_type: workType };
    // Pre-populate remote with "Anywhere in USA" if locations is empty
    if (workType === "remote" && updated[index].locations.length === 0) {
      updated[index].locations = ["Anywhere in USA"];
    }
    onChange(updated);
  };

  const updateLocations = (index: number, locations: string[]) => {
    const updated = [...preferences];
    updated[index] = { ...updated[index], locations };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {preferences.map((pref, index) => (
        <div key={index} className="border rounded-lg p-4 bg-gray-50">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <select
                value={pref.work_type}
                onChange={(e) => updateWorkType(index, e.target.value as "remote" | "hybrid" | "onsite")}
                className="px-3 py-1.5 border rounded-lg text-sm font-medium focus:ring-2 focus:ring-violet-500"
              >
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
              <span className="text-sm text-gray-500 truncate max-w-[180px] sm:max-w-xs">
                {pref.locations.length > 0 ? pref.locations.join(", ") : "No locations set"}
              </span>
            </div>
            <button
              onClick={() => removeEntry(index)}
              className="text-red-500 hover:text-red-700 text-sm min-h-[44px] min-w-[44px] flex items-center justify-end flex-shrink-0"
            >
              Remove
            </button>
          </div>
          <LocationMultiSelect
            selected={pref.locations}
            onChange={(locs) => updateLocations(index, locs)}
          />
        </div>
      ))}
      <button
        onClick={addEntry}
        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors text-sm"
      >
        + Add Work Type Preference
      </button>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

export default function ProfileClient({
  profile: initial,
  documents: initialDocs,
}: {
  profile: ProfileData;
  documents: DocRecord[];
}) {
  const [profile, setProfile] = useState<ProfileData>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [docs, setDocs] = useState<DocRecord[]>(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useCallback(async (section: string, fields: Partial<ProfileData>) => {
    setSaving(section);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to save." });
        return;
      }
      const { profile: updated } = await res.json();
      setProfile(updated);
      setMessage({ type: "success", text: `${section} saved!` });
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(null);
    }
  }, []);

  const update = (key: keyof ProfileData, value: unknown) => {
    setProfile((p) => ({ ...p, [key]: value }));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/portal/resume/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Upload failed." });
        return;
      }
      const { document, parsed_profile } = await res.json();
      setDocs((d) => [document, ...d]);

      // If resume was parsed, offer to prefill profile
      if (parsed_profile && Object.keys(parsed_profile).length > 0) {
        setParsing(true);
        const fieldsToApply: Partial<ProfileData> = {};
        if (parsed_profile.full_name && !profile.full_name) fieldsToApply.full_name = parsed_profile.full_name;
        if (parsed_profile.phone && !profile.phone) fieldsToApply.phone = parsed_profile.phone;
        if (parsed_profile.location && !profile.location) fieldsToApply.location = parsed_profile.location;
        if (parsed_profile.linkedin_url && !profile.linkedin_url) fieldsToApply.linkedin_url = parsed_profile.linkedin_url;
        if (parsed_profile.skills?.length > 0 && (!profile.skills || profile.skills.length === 0)) fieldsToApply.skills = parsed_profile.skills;
        if (parsed_profile.work_history?.length > 0 && (!profile.work_history || profile.work_history.length === 0)) fieldsToApply.work_history = parsed_profile.work_history;
        if (parsed_profile.education?.length > 0 && (!profile.education || profile.education.length === 0)) fieldsToApply.education = parsed_profile.education;

        if (Object.keys(fieldsToApply).length > 0) {
          setProfile((p) => ({ ...p, ...fieldsToApply }));
          setMessage({
            type: "success",
            text: `Resume uploaded & parsed! Profile pre-filled with: ${Object.keys(fieldsToApply).join(", ")}. Review and save each section.`,
          });
        } else {
          setMessage({ type: "success", text: "Resume uploaded & parsed!" });
        }
        setParsing(false);
      } else {
        setMessage({ type: "success", text: "Resume uploaded!" });
      }
    } catch {
      setMessage({ type: "error", text: "Upload failed." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Tag input helpers
  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !(profile.skills || []).includes(s)) update("skills", [...(profile.skills || []), s]);
    setSkillInput("");
  };
  const removeSkill = (skill: string) => update("skills", (profile.skills || []).filter((s) => s !== skill));

  const addTargetTitle = () => {
    const t = titleInput.trim();
    if (t && !(profile.target_titles || []).includes(t)) update("target_titles", [...(profile.target_titles || []), t]);
    setTitleInput("");
  };
  const removeTargetTitle = (title: string) => update("target_titles", (profile.target_titles || []).filter((t) => t !== title));

  // Work history helpers
  const addWorkEntry = () => {
    update("work_history", [...(profile.work_history || []), { title: "", company: "", start_date: "", end_date: "", current: false, description: "" }]);
  };
  const updateWorkEntry = (i: number, field: keyof WorkEntry, value: unknown) => {
    const entries = [...(profile.work_history || [])];
    entries[i] = { ...entries[i], [field]: value };
    update("work_history", entries);
  };
  const removeWorkEntry = (i: number) => update("work_history", (profile.work_history || []).filter((_, idx) => idx !== i));

  // Education helpers
  const addEducationEntry = () => {
    update("education", [...(profile.education || []), { degree: "", school: "", field: "", graduation_year: "" }]);
  };
  const updateEducationEntry = (i: number, field: keyof EducationEntry, value: string) => {
    const entries = [...(profile.education || [])];
    entries[i] = { ...entries[i], [field]: value };
    update("education", entries);
  };
  const removeEducationEntry = (i: number) => update("education", (profile.education || []).filter((_, idx) => idx !== i));

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <h2 className="text-2xl font-bold text-gray-900">Your Profile</h2>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {message.text}
        </div>
      )}

      {/* ═══ Resume Upload ═══ */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Resume</h3>
        <p className="text-sm text-gray-500 mb-4">Upload your resume to automatically pre-fill your profile. We'll extract your skills, work history, and education.</p>
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-8 text-center hover:border-violet-400 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleUpload} className="hidden" />
          {uploading || parsing ? (
            <p className="text-gray-500">{parsing ? "Parsing resume..." : "Uploading..."}</p>
          ) : (
            <>
              <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 font-medium">Click to upload your resume</p>
              <p className="text-sm text-gray-400 mt-1">PDF, DOCX, DOC, or TXT (max 5MB)</p>
            </>
          )}
        </div>

        <div className="mt-4 p-4 border rounded-lg bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resume Template Preference
              </label>
              <select
                value={profile.resume_template_id || "classic"}
                onChange={(e) =>
                  update("resume_template_id", e.target.value as ResumeTemplateId)
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500"
              >
                {RESUME_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} - {template.description}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                AM/Admin tailoring and generated resume PDFs will follow this template unless manually overridden.
              </p>
            </div>
            <button
              onClick={() =>
                save("Resume Template", {
                  resume_template_id:
                    (profile.resume_template_id || "classic") as ResumeTemplateId,
                })
              }
              disabled={saving === "Resume Template"}
              className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {saving === "Resume Template" ? "Saving..." : "Save Template"}
            </button>
          </div>
        </div>

        {docs.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Uploaded Resumes</h4>
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{doc.file_name}</p>
                  <p className="text-xs text-gray-500">{new Date(doc.uploaded_at).toLocaleDateString()}</p>
                </div>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-violet-600 hover:text-violet-800">Download</a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Gmail Connection ═══ */}
      <GmailConnect />

      {/* ═══ Personal Information ═══ */}
      <Section
        title="Personal Information"
        complete={sectionComplete("Personal", profile)}
        saving={saving === "Personal"}
        onSave={() => save("Personal", {
          full_name: profile.full_name, phone: profile.phone, location: profile.location,
          linkedin_url: profile.linkedin_url, portfolio_url: profile.portfolio_url,
          address_line1: profile.address_line1, address_city: profile.address_city,
          address_state: profile.address_state, address_zip: profile.address_zip,
          address_country: profile.address_country,
        })}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name" value={profile.full_name} onChange={(v) => update("full_name", v)} />
          <Field label="Email" value={profile.email} disabled />
          <Field label="Phone" value={profile.phone} onChange={(v) => update("phone", v)} type="tel" />
          <Field label="Location" value={profile.location} onChange={(v) => update("location", v)} placeholder="City, State" />
          <Field label="LinkedIn URL" value={profile.linkedin_url} onChange={(v) => update("linkedin_url", v)} placeholder="https://linkedin.com/in/..." type="url" />
          <Field label="Portfolio URL" value={profile.portfolio_url} onChange={(v) => update("portfolio_url", v)} placeholder="https://..." type="url" />
        </div>
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Mailing Address</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="" value={profile.address_line1} onChange={(v) => update("address_line1", v)} placeholder="Street address" />
            </div>
            <Field label="" value={profile.address_city} onChange={(v) => update("address_city", v)} placeholder="City" />
            <Field label="" value={profile.address_state} onChange={(v) => update("address_state", v)} placeholder="State" />
            <Field label="" value={profile.address_zip} onChange={(v) => update("address_zip", v)} placeholder="ZIP code" />
            <Field label="" value={profile.address_country} onChange={(v) => update("address_country", v)} placeholder="Country" />
          </div>
        </div>
      </Section>

      {/* ═══ Job Preferences ═══ */}
      <Section
        title="Job Preferences"
        description="Configure your work type and location preferences. For each work type, specify which locations you'd consider."
        complete={sectionComplete("Preferences", profile)}
        saving={saving === "Preferences"}
        onSave={() => {
          // Derive flat fields for backward compatibility
          const locPrefs = profile.location_preferences || [];
          const derivedWorkTypes = Array.from(new Set(locPrefs.map((p) => p.work_type)));
          const derivedLocations = Array.from(new Set(locPrefs.flatMap((p) => p.locations)));
          save("Preferences", {
            seniority: profile.seniority, work_type: profile.work_type,
            work_type_preferences: derivedWorkTypes,
            preferred_locations: derivedLocations,
            location_preferences: locPrefs,
            employment_type_preferences: profile.employment_type_preferences,
            salary_min: profile.salary_min, salary_max: profile.salary_max,
            target_titles: profile.target_titles, years_experience: profile.years_experience,
            open_to_relocation: profile.open_to_relocation,
          });
        }}
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Work Type & Location Preferences</label>
            <p className="text-xs text-gray-500 mb-3">Add entries to specify which work types you prefer and where. For example: "Remote — Anywhere in USA" and "Hybrid — Houston, TX".</p>
            <LocationPreferencesEditor
              preferences={profile.location_preferences || []}
              onChange={(v) => update("location_preferences", v)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employment Type (select all that apply)</label>
            <MultiCheckbox
              options={EMPLOYMENT_TYPE_OPTIONS}
              selected={profile.employment_type_preferences || []}
              onChange={(v) => update("employment_type_preferences", v)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Seniority Level</label>
              <select value={profile.seniority || ""} onChange={(e) => update("seniority", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
                <option value="">Select...</option>
                <option value="entry">Entry Level</option>
                <option value="mid">Mid Level</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
                <option value="manager">Manager</option>
                <option value="director">Director</option>
                <option value="vp">VP</option>
                <option value="c-level">C-Level</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
              <input type="number" value={profile.years_experience ?? ""} onChange={(e) => update("years_experience", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="e.g. 5" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desired Minimum Salary</label>
              <input type="number" value={profile.salary_min ?? ""} onChange={(e) => update("salary_min", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="e.g. 80000" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desired Maximum Salary</label>
              <input type="number" value={profile.salary_max ?? ""} onChange={(e) => update("salary_max", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="e.g. 120000" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Job Titles</label>
            <div className="flex gap-2">
              <input type="text" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTargetTitle())} placeholder="Add a target title..." className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
              <button onClick={addTargetTitle} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Add</button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(profile.target_titles || []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-3 py-1 bg-violet-100 text-violet-800 rounded-full text-sm">
                  {t}<button onClick={() => removeTargetTitle(t)} className="hover:text-violet-600">&times;</button>
                </span>
              ))}
            </div>
          </div>

          <BooleanToggle label="Willing to relocate?" value={profile.open_to_relocation} onChange={(v) => update("open_to_relocation", v)} />
        </div>
      </Section>

      {/* ═══ Skills ═══ */}
      <Section title="Skills" complete={sectionComplete("Skills", profile)} saving={saving === "Skills"} onSave={() => save("Skills", { skills: profile.skills })}>
        <div className="flex gap-2">
          <input type="text" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())} placeholder="Add a skill..." className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
          <button onClick={addSkill} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Add</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {(profile.skills || []).map((s) => (
            <span key={s} className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
              {s}<button onClick={() => removeSkill(s)} className="hover:text-green-600">&times;</button>
            </span>
          ))}
        </div>
      </Section>

      {/* ═══ Work History ═══ */}
      <Section title="Work History" description="Confirm your employment details." complete={sectionComplete("Work", profile)} saving={saving === "Work"} onSave={() => save("Work", { work_history: profile.work_history })}>
        {(profile.work_history || []).map((entry, i) => (
          <div key={i} className="border rounded-lg p-4 mb-4">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-medium text-gray-500">Position {i + 1}</span>
              <button onClick={() => removeWorkEntry(i)} className="text-red-500 hover:text-red-700 text-sm min-h-[44px] min-w-[44px] flex items-center justify-end">Remove</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" value={entry.title} onChange={(e) => updateWorkEntry(i, "title", e.target.value)} placeholder="Job Title" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
              <input type="text" value={entry.company} onChange={(e) => updateWorkEntry(i, "company", e.target.value)} placeholder="Company Name" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
              <input type="text" value={entry.start_date} onChange={(e) => updateWorkEntry(i, "start_date", e.target.value)} placeholder="Start Date (YYYY-MM)" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
              <div className="flex items-center gap-3">
                <input type="text" value={entry.end_date} onChange={(e) => updateWorkEntry(i, "end_date", e.target.value)} placeholder="End Date (YYYY-MM)" disabled={entry.current} className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500 disabled:bg-gray-50" />
                <label className="flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
                  <input type="checkbox" checked={entry.current} onChange={(e) => updateWorkEntry(i, "current", e.target.checked)} className="rounded" />Current
                </label>
              </div>
              <div className="sm:col-span-2">
                <textarea value={entry.description} onChange={(e) => updateWorkEntry(i, "description", e.target.value)} placeholder="Description of responsibilities and achievements..." rows={3} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>
          </div>
        ))}
        <button onClick={addWorkEntry} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors">+ Add Position</button>
      </Section>

      {/* ═══ Education ═══ */}
      <Section title="Education" description="Confirm your education details." complete={sectionComplete("Education", profile)} saving={saving === "Education"} onSave={() => save("Education", { education: profile.education })}>
        {(profile.education || []).map((entry, i) => (
          <div key={i} className="border rounded-lg p-4 mb-4">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-medium text-gray-500">Education {i + 1}</span>
              <button onClick={() => removeEducationEntry(i)} className="text-red-500 hover:text-red-700 text-sm min-h-[44px] min-w-[44px] flex items-center justify-end">Remove</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Degree Type</label>
                <select value={entry.degree} onChange={(e) => updateEducationEntry(i, "degree", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
                  <option value="">Select...</option>
                  <option value="High School Diploma">High School Diploma</option>
                  <option value="GED">GED</option>
                  <option value="Associate">Associate Degree</option>
                  <option value="Bachelor">Bachelor's Degree</option>
                  <option value="Master">Master's Degree</option>
                  <option value="MBA">MBA</option>
                  <option value="PhD">PhD / Doctorate</option>
                  <option value="Certificate">Certificate / Diploma</option>
                  <option value="Bootcamp">Bootcamp</option>
                </select>
              </div>
              <input type="text" value={entry.school} onChange={(e) => updateEducationEntry(i, "school", e.target.value)} placeholder="School / University" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
              <input type="text" value={entry.field} onChange={(e) => updateEducationEntry(i, "field", e.target.value)} placeholder="Field of Study" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
              <input type="text" value={entry.graduation_year} onChange={(e) => updateEducationEntry(i, "graduation_year", e.target.value)} placeholder="Graduation Year" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>
        ))}
        <button onClick={addEducationEntry} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors">+ Add Education</button>
      </Section>

      {/* ═══ Work Authorization ═══ */}
      <Section
        title="Work Authorization"
        description="These answers help auto-fill work authorization questions on job applications."
        complete={sectionComplete("Authorization", profile)}
        saving={saving === "Authorization"}
        onSave={() => save("Authorization", {
          authorized_to_work: profile.authorized_to_work,
          requires_visa_sponsorship: profile.requires_visa_sponsorship,
          visa_status: profile.visa_status,
          citizenship_status: profile.citizenship_status,
          requires_h1b_transfer: profile.requires_h1b_transfer,
          needs_employer_sponsorship: profile.needs_employer_sponsorship,
        })}
      >
        <div className="space-y-3 divide-y divide-gray-100">
          <BooleanToggle label="Are you legally authorized to work in this country?" value={profile.authorized_to_work} onChange={(v) => update("authorized_to_work", v)} />
          <BooleanToggle label="Will you now or in the future require visa sponsorship?" value={profile.requires_visa_sponsorship} onChange={(v) => update("requires_visa_sponsorship", v)} />
          <div className="pt-3">
            <label className="block text-sm text-gray-700 mb-1">What is your visa / citizenship status?</label>
            <select value={profile.citizenship_status || ""} onChange={(e) => update("citizenship_status", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
              <option value="">Select...</option>
              <option value="US Citizen">US Citizen</option>
              <option value="Green Card Holder">Green Card / Permanent Resident</option>
              <option value="H1B Visa">H1B Visa</option>
              <option value="H4 EAD">H4 EAD</option>
              <option value="L1 Visa">L1 Visa</option>
              <option value="OPT">OPT (Optional Practical Training)</option>
              <option value="CPT">CPT (Curricular Practical Training)</option>
              <option value="TN Visa">TN Visa (NAFTA)</option>
              <option value="O1 Visa">O1 Visa</option>
              <option value="EAD">EAD (Employment Authorization)</option>
              <option value="Canadian Citizen">Canadian Citizen</option>
              <option value="Canadian PR">Canadian Permanent Resident</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <BooleanToggle label="Do you require H1B transfer?" value={profile.requires_h1b_transfer} onChange={(v) => update("requires_h1b_transfer", v)} />
          <BooleanToggle label="Do you need employer sponsorship?" value={profile.needs_employer_sponsorship} onChange={(v) => update("needs_employer_sponsorship", v)} />
        </div>
      </Section>

      {/* ═══ Availability & Logistics ═══ */}
      <Section
        title="Availability & Logistics"
        complete={sectionComplete("Availability", profile)}
        saving={saving === "Availability"}
        onSave={() => save("Availability", {
          start_date: profile.start_date, notice_period: profile.notice_period,
          available_for_relocation: profile.available_for_relocation,
          available_for_travel: profile.available_for_travel,
          willing_to_work_overtime: profile.willing_to_work_overtime,
          willing_to_work_weekends: profile.willing_to_work_weekends,
          preferred_shift: profile.preferred_shift,
          minimum_salary: profile.minimum_salary,
          open_to_contract: profile.open_to_contract,
        })}
      >
        <div className="space-y-3 divide-y divide-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">When can you start?</label>
              <select value={profile.start_date || ""} onChange={(e) => update("start_date", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
                <option value="">Select...</option>
                <option value="Immediately">Immediately</option>
                <option value="1 week">1 week</option>
                <option value="2 weeks">2 weeks</option>
                <option value="1 month">1 month</option>
                <option value="2 months">2 months</option>
                <option value="3+ months">3+ months</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Notice period</label>
              <select value={profile.notice_period || ""} onChange={(e) => update("notice_period", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
                <option value="">Select...</option>
                <option value="None">None (currently not employed)</option>
                <option value="1 week">1 week</option>
                <option value="2 weeks">2 weeks</option>
                <option value="1 month">1 month</option>
                <option value="2 months">2 months</option>
                <option value="3+ months">3+ months</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Preferred shift</label>
              <select value={profile.preferred_shift || ""} onChange={(e) => update("preferred_shift", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
                <option value="">Select...</option>
                <option value="Day">Day shift</option>
                <option value="Evening">Evening shift</option>
                <option value="Night">Night shift</option>
                <option value="Flexible">Flexible</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Minimum salary requirement</label>
              <input type="number" value={profile.minimum_salary ?? ""} onChange={(e) => update("minimum_salary", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="e.g. 75000" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>
          <BooleanToggle label="Available for relocation?" value={profile.available_for_relocation} onChange={(v) => update("available_for_relocation", v)} />
          <BooleanToggle label="Available for travel?" value={profile.available_for_travel} onChange={(v) => update("available_for_travel", v)} />
          <BooleanToggle label="Willing to work overtime?" value={profile.willing_to_work_overtime} onChange={(v) => update("willing_to_work_overtime", v)} />
          <BooleanToggle label="Willing to work weekends?" value={profile.willing_to_work_weekends} onChange={(v) => update("willing_to_work_weekends", v)} />
          <BooleanToggle label="Open to contract / freelance?" value={profile.open_to_contract} onChange={(v) => update("open_to_contract", v)} />
        </div>
      </Section>

      {/* ═══ Equal Opportunity (EEO) ═══ */}
      <Section
        title="Equal Opportunity (EEO)"
        description="These questions are optional and used to auto-fill voluntary EEO questions on job applications. Your answers will not affect your applications."
        complete={sectionComplete("EEO", profile)}
        saving={saving === "EEO"}
        onSave={() => save("EEO", {
          eeo_gender: profile.eeo_gender,
          eeo_race: profile.eeo_race,
          eeo_veteran_status: profile.eeo_veteran_status,
          eeo_disability_status: profile.eeo_disability_status,
        })}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Gender</label>
            <select value={profile.eeo_gender || ""} onChange={(e) => update("eeo_gender", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
              <option value="">Prefer not to say</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Other">Other</option>
              <option value="Decline">Decline to self-identify</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Race / Ethnicity</label>
            <select value={profile.eeo_race || ""} onChange={(e) => update("eeo_race", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
              <option value="">Prefer not to say</option>
              <option value="American Indian or Alaska Native">American Indian or Alaska Native</option>
              <option value="Asian">Asian</option>
              <option value="Black or African American">Black or African American</option>
              <option value="Hispanic or Latino">Hispanic or Latino</option>
              <option value="Native Hawaiian or Other Pacific Islander">Native Hawaiian or Other Pacific Islander</option>
              <option value="White">White</option>
              <option value="Two or More Races">Two or More Races</option>
              <option value="Decline">Decline to self-identify</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Veteran Status</label>
            <select value={profile.eeo_veteran_status || ""} onChange={(e) => update("eeo_veteran_status", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
              <option value="">Prefer not to say</option>
              <option value="I am not a protected veteran">I am not a protected veteran</option>
              <option value="I identify as one or more of the classifications of a protected veteran">I identify as a protected veteran</option>
              <option value="Decline">Decline to self-identify</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Disability Status</label>
            <select value={profile.eeo_disability_status || ""} onChange={(e) => update("eeo_disability_status", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-violet-500">
              <option value="">Prefer not to say</option>
              <option value="Yes, I have a disability">Yes, I have a disability (or previously had)</option>
              <option value="No, I do not have a disability">No, I do not have a disability</option>
              <option value="Decline">Decline to self-identify</option>
            </select>
          </div>
        </div>
      </Section>

      {/* ═══ Background & Legal ═══ */}
      <Section
        title="Background & Legal"
        description="These answers auto-fill common background check consent questions."
        complete={sectionComplete("Background", profile)}
        saving={saving === "Background"}
        onSave={() => save("Background", {
          felony_conviction: profile.felony_conviction,
          non_compete_subject: profile.non_compete_subject,
          consent_background_check: profile.consent_background_check,
          consent_drug_screening: profile.consent_drug_screening,
        })}
      >
        <div className="space-y-3 divide-y divide-gray-100">
          <BooleanToggle label="Have you ever been convicted of a felony?" value={profile.felony_conviction} onChange={(v) => update("felony_conviction", v)} />
          <BooleanToggle label="Are you subject to a non-compete agreement?" value={profile.non_compete_subject} onChange={(v) => update("non_compete_subject", v)} />
          <BooleanToggle label="Do you consent to a background check?" value={profile.consent_background_check} onChange={(v) => update("consent_background_check", v)} />
          <BooleanToggle label="Do you consent to drug screening?" value={profile.consent_drug_screening} onChange={(v) => update("consent_drug_screening", v)} />
        </div>
      </Section>
    </div>
  );
}
