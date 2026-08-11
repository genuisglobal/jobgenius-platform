"use client";

import { useState } from "react";
import type { StructuredResume, ResumeTemplateId } from "@/lib/resume-templates/types";

interface ResumePreviewProps {
  data: StructuredResume;
  templateId: ResumeTemplateId;
  editMode: boolean;
  onDataChange: (data: StructuredResume) => void;
}

export default function ResumePreview({
  data,
  templateId,
  editMode,
  onDataChange,
}: ResumePreviewProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const updateField = <K extends keyof StructuredResume>(
    key: K,
    value: StructuredResume[K]
  ) => {
    onDataChange({ ...data, [key]: value });
  };

  const updateWorkExperience = (index: number, field: string, value: unknown) => {
    const updated = [...data.workExperience];
    updated[index] = { ...updated[index], [field]: value };
    updateField("workExperience", updated);
  };

  const updateEducation = (index: number, field: string, value: unknown) => {
    const updated = [...data.education];
    updated[index] = { ...updated[index], [field]: value };
    updateField("education", updated);
  };

  const removeSkill = (index: number) => {
    const updated = data.skills.filter((_, i) => i !== index);
    updateField("skills", updated);
  };

  const addSkill = (skill: string) => {
    if (skill.trim() && !data.skills.includes(skill.trim())) {
      updateField("skills", [...data.skills, skill.trim()]);
    }
  };

  // Template-specific style classes
  const templateStyles: Record<
    ResumeTemplateId,
    { nameClass: string; nameAlign: string; sectionClass: string }
  > = {
    classic: {
      nameClass: "text-xl font-bold",
      nameAlign: "text-center",
      sectionClass: "text-sm font-bold uppercase tracking-wide text-gray-900 border-b pb-1",
    },
    modern: {
      nameClass: "text-2xl font-bold",
      nameAlign: "text-left",
      sectionClass: "text-sm font-bold text-gray-900 border-b border-gray-300 pb-1",
    },
    executive: {
      nameClass: "text-2xl font-bold",
      nameAlign: "text-center",
      sectionClass: "text-sm font-bold uppercase tracking-wider text-gray-800 border-b-2 border-gray-400 pb-1",
    },
    compact: {
      nameClass: "text-lg font-bold",
      nameAlign: "text-left",
      sectionClass: "text-xs font-bold uppercase tracking-wide text-gray-900 border-b pb-0.5",
    },
  };

  const style = templateStyles[templateId];
  const c = data.contact;

  return (
    <div className="bg-white border rounded-lg p-6 space-y-4 text-sm">
      {/* Contact Header */}
      <div className={style.nameAlign}>
        {editMode ? (
          <input
            type="text"
            value={c.fullName}
            onChange={(e) =>
              updateField("contact", { ...c, fullName: e.target.value })
            }
            className={`${style.nameClass} w-full bg-violet-50 border border-violet-200 rounded px-2 py-1 ${style.nameAlign}`}
          />
        ) : (
          <h2 className={style.nameClass}>{c.fullName}</h2>
        )}
        <p className="text-xs text-gray-500 mt-1">
          {[c.email, c.phone, c.location, c.linkedinUrl, c.portfolioUrl]
            .filter(Boolean)
            .join("  |  ")}
        </p>
      </div>

      {templateId !== "compact" && <hr className="border-gray-300" />}

      {/* Summary */}
      {(data.summary || editMode) && (
        <div>
          <h3 className={style.sectionClass}>
            {templateId === "executive" ? "Professional Summary" : "Summary"}
          </h3>
          <div className="mt-2">
            {editMode ? (
              <textarea
                value={data.summary}
                onChange={(e) => updateField("summary", e.target.value)}
                className="w-full bg-violet-50 border border-violet-200 rounded px-2 py-1 text-sm resize-y"
                rows={3}
              />
            ) : (
              <p className="text-gray-700">{data.summary}</p>
            )}
          </div>
        </div>
      )}

      {/* Work Experience */}
      {data.workExperience.length > 0 && (
        <div>
          <h3 className={style.sectionClass}>
            {templateId === "executive" ? "Professional Experience" : "Experience"}
          </h3>
          <div className="mt-2 space-y-3">
            {data.workExperience.map((w, i) => (
              <div key={i} className={editMode ? "bg-violet-50 border border-violet-200 rounded p-3" : ""}>
                {editMode ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        value={w.title}
                        onChange={(e) => updateWorkExperience(i, "title", e.target.value)}
                        placeholder="Title"
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <input
                        value={w.company}
                        onChange={(e) => updateWorkExperience(i, "company", e.target.value)}
                        placeholder="Company"
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <input
                        value={w.startDate}
                        onChange={(e) => updateWorkExperience(i, "startDate", e.target.value)}
                        placeholder="Start Date"
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <input
                        value={w.endDate}
                        onChange={(e) => updateWorkExperience(i, "endDate", e.target.value)}
                        placeholder="End Date"
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      {w.bullets.map((b, bi) => (
                        <div key={bi} className="flex gap-1">
                          <span className="text-gray-400 mt-1">-</span>
                          <input
                            value={b}
                            onChange={(e) => {
                              const newBullets = [...w.bullets];
                              newBullets[bi] = e.target.value;
                              updateWorkExperience(i, "bullets", newBullets);
                            }}
                            className="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm"
                          />
                          <button
                            onClick={() => {
                              const newBullets = w.bullets.filter((_, idx) => idx !== bi);
                              updateWorkExperience(i, "bullets", newBullets);
                            }}
                            className="text-red-500 text-xs px-1"
                          >
                            x
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => updateWorkExperience(i, "bullets", [...w.bullets, ""])}
                        className="text-xs text-violet-600 hover:text-violet-800"
                      >
                        + Add bullet
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {templateId === "executive" ? (
                      <>
                        <p className="font-semibold text-gray-900 uppercase">{w.company}</p>
                        <p className="text-gray-700 italic">{w.title}{w.location ? ` | ${w.location}` : ""}</p>
                      </>
                    ) : templateId === "compact" ? (
                      <p className="font-semibold text-gray-900">{w.title}, {w.company}{w.location ? ` - ${w.location}` : ""}</p>
                    ) : (
                      <>
                        <p className="font-semibold text-gray-900">{w.title} - {w.company}</p>
                        {w.location && <span className="text-xs text-gray-500">{w.location}</span>}
                      </>
                    )}
                    <p className="text-xs text-gray-500">{w.startDate} - {w.endDate}</p>
                    <ul className="mt-1 space-y-0.5">
                      {w.bullets.map((b, bi) => (
                        <li key={bi} className="text-gray-700 pl-3 relative before:content-['\2022'] before:absolute before:left-0 before:text-gray-400">
                          {b}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {data.education.length > 0 && (
        <div>
          <h3 className={style.sectionClass}>Education</h3>
          <div className="mt-2 space-y-2">
            {data.education.map((e, i) => (
              <div key={i} className={editMode ? "bg-violet-50 border border-violet-200 rounded p-3" : ""}>
                {editMode ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={e.degree}
                      onChange={(ev) => updateEducation(i, "degree", ev.target.value)}
                      placeholder="Degree"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      value={e.institution}
                      onChange={(ev) => updateEducation(i, "institution", ev.target.value)}
                      placeholder="Institution"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      value={e.field || ""}
                      onChange={(ev) => updateEducation(i, "field", ev.target.value || null)}
                      placeholder="Field of Study"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      value={e.graduationDate}
                      onChange={(ev) => updateEducation(i, "graduationDate", ev.target.value)}
                      placeholder="Graduation Date"
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-semibold text-gray-900">
                      {e.degree}{e.field ? ` in ${e.field}` : ""}
                    </p>
                    <p className="text-gray-600">{e.institution} | {e.graduationDate}</p>
                    {e.gpa && <p className="text-xs text-gray-500">GPA: {e.gpa}</p>}
                    {e.honors && <p className="text-xs text-gray-500 italic">{e.honors}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {(data.skills.length > 0 || editMode) && (
        <div>
          <h3 className={style.sectionClass}>
            {templateId === "executive" ? "Core Competencies" : "Skills"}
          </h3>
          <div className="mt-2">
            {editMode ? (
              <div className="flex flex-wrap gap-1.5">
                {data.skills.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-800 text-xs rounded-full"
                  >
                    {s}
                    <button
                      onClick={() => removeSkill(i)}
                      className="text-violet-600 hover:text-violet-900 font-bold"
                    >
                      x
                    </button>
                  </span>
                ))}
                <SkillAdder onAdd={addSkill} />
              </div>
            ) : (
              <p className="text-gray-700">
                {templateId === "executive"
                  ? data.skills.join("  |  ")
                  : data.skills.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Certifications */}
      {data.certifications.length > 0 && (
        <div>
          <h3 className={style.sectionClass}>Certifications</h3>
          <div className="mt-2 space-y-1">
            {data.certifications.map((cert, i) => (
              <p key={i} className="text-gray-700">
                {[cert.name, cert.issuer, cert.date].filter(Boolean).join(" - ")}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkillAdder({ onAdd }: { onAdd: (skill: string) => void }) {
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue("");
    }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        placeholder="Add skill..."
        className="px-2 py-0.5 border border-gray-300 rounded text-xs w-24"
      />
      <button
        onClick={handleAdd}
        className="text-xs text-violet-600 hover:text-violet-800 font-medium"
      >
        +
      </button>
    </div>
  );
}
