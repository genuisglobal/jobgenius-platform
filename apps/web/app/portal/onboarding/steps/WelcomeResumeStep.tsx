"use client";

import { useState, useRef } from "react";
import type { ProfileData, DocRecord } from "../OnboardingWizard";

export default function WelcomeResumeStep({
  profile,
  docs,
  setDocs,
  updateMany,
  onContinue,
  userName,
}: {
  profile: ProfileData;
  docs: DocRecord[];
  setDocs: React.Dispatch<React.SetStateAction<DocRecord[]>>;
  updateMany: (fields: Partial<ProfileData>) => void;
  onContinue: () => void;
  userName: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

      if (parsed_profile && Object.keys(parsed_profile).length > 0) {
        setParsing(true);
        const fieldsToApply: Partial<ProfileData> = {};
        if (parsed_profile.full_name && !profile.full_name) fieldsToApply.full_name = parsed_profile.full_name;
        if (parsed_profile.phone && !profile.phone) fieldsToApply.phone = parsed_profile.phone;
        if (parsed_profile.location && !profile.location) fieldsToApply.location = parsed_profile.location;
        if (parsed_profile.linkedin_url && !profile.linkedin_url) fieldsToApply.linkedin_url = parsed_profile.linkedin_url;
        if (parsed_profile.skills?.length > 0 && (!profile.skills || profile.skills.length === 0)) fieldsToApply.skills = parsed_profile.skills;

        if (Object.keys(fieldsToApply).length > 0) {
          updateMany(fieldsToApply);
          setMessage({
            type: "success",
            text: `Resume uploaded & parsed! Pre-filled: ${Object.keys(fieldsToApply).join(", ")}. We'll use this data in the next steps.`,
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
      fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Welcome to JobGenius, {userName}!
      </h2>
      <p className="text-gray-600 mb-6">
        Let&apos;s set up your profile so we can start finding the best job opportunities for you.
      </p>

      <div className="space-y-3 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5 text-violet-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm text-gray-700">Your dedicated account manager will search and apply for jobs on your behalf.</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5 text-violet-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm text-gray-700">We match you with roles based on your skills, experience, and preferences.</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5 text-violet-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm text-gray-700">Track your applications, interviews, and progress all in one place.</p>
        </div>
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-6">
        <p className="text-sm text-violet-800">
          Uploading your resume lets us pre-fill most of your profile automatically.
        </p>
      </div>

      {/* Upload zone */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-violet-400 transition-colors cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleUpload} className="hidden" />
        {uploading || parsing ? (
          <p className="text-gray-500">{parsing ? "Parsing resume..." : "Uploading..."}</p>
        ) : (
          <>
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600 font-medium">Drag & drop your resume or click to upload</p>
            <p className="text-sm text-gray-400 mt-1">PDF, DOCX, DOC, or TXT (max 5MB)</p>
          </>
        )}
      </div>

      {message && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {message.text}
        </div>
      )}

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

      <div className="flex justify-between mt-8">
        <button onClick={onContinue} className="text-sm text-gray-500 hover:text-gray-700">
          Fill in manually instead
        </button>
        <button onClick={onContinue} className="px-6 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">
          Continue
        </button>
      </div>
    </div>
  );
}
