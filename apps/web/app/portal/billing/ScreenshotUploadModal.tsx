"use client";

import { useState, useRef } from "react";

interface ScreenshotUploadModalProps {
  installmentId?: string;
  offerId?: string;
  paymentRequestId?: string;
  label?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ScreenshotUploadModal({
  installmentId,
  offerId,
  paymentRequestId,
  label,
  onClose,
  onSuccess,
}: ScreenshotUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowed.includes(selected.type)) {
      setError("Only JPEG, PNG, WebP, GIF, or PDF files are allowed.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError("File must be under 10MB.");
      return;
    }
    setFile(selected);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file.");
      return;
    }
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (installmentId) formData.append("installmentId", installmentId);
      if (offerId) formData.append("offerId", offerId);
      if (paymentRequestId) formData.append("paymentRequestId", paymentRequestId);

      const res = await fetch("/api/portal/billing/screenshot", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Upload failed. Please try again.");
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Upload Payment Screenshot</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {label && (
            <p className="text-sm text-gray-600 mb-4">
              Uploading for: <strong>{label}</strong>
            </p>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              file ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-violet-400 hover:bg-violet-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            {file ? (
              <div>
                <svg className="w-10 h-10 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                <p className="text-xs text-violet-600 mt-2">Click to change file</p>
              </div>
            ) : (
              <div>
                <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium text-gray-700">Click to upload screenshot</p>
                <p className="text-xs text-gray-500 mt-1">JPEG, PNG, WebP, GIF, or PDF — max 10MB</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <p className="text-xs text-gray-500 mt-3">
            After uploading, an admin will review and confirm your payment within 1-2 business days.
          </p>
        </div>

        <div className="flex gap-3 p-5 border-t">
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading…" : "Upload Screenshot"}
          </button>
        </div>
      </div>
    </div>
  );
}
