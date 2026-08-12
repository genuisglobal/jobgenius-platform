"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PromoCodeStatus = "active" | "inactive" | "expired";

interface PromoCode {
  id: string;
  code: string;
  label: string;
  status: PromoCodeStatus;
  discount_percent_essentials: number;
  discount_percent_premium: number;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  single_use_per_email: boolean;
}

interface PromoCodesClientProps {
  promoCodes: PromoCode[];
}

type PromoCodeForm = {
  code: string;
  label: string;
  status: PromoCodeStatus;
  discountPercentEssentials: string;
  discountPercentPremium: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  singleUsePerEmail: boolean;
};

function toFormValues(promoCode?: PromoCode): PromoCodeForm {
  return {
    code: promoCode?.code ?? "",
    label: promoCode?.label ?? "",
    status: promoCode?.status ?? "active",
    discountPercentEssentials: String(
      Math.round(Number(promoCode?.discount_percent_essentials ?? 0.2) * 100)
    ),
    discountPercentPremium: String(
      Math.round(Number(promoCode?.discount_percent_premium ?? 0.25) * 100)
    ),
    startsAt: promoCode?.starts_at ? promoCode.starts_at.slice(0, 16) : "",
    endsAt: promoCode?.ends_at ? promoCode.ends_at.slice(0, 16) : "",
    maxRedemptions:
      typeof promoCode?.max_redemptions === "number"
        ? String(promoCode.max_redemptions)
        : "",
    singleUsePerEmail: promoCode?.single_use_per_email ?? true,
  };
}

export default function PromoCodesClient({ promoCodes }: PromoCodesClientProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<PromoCodeForm>(toFormValues());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, PromoCodeForm>>(
    Object.fromEntries(promoCodes.map((promoCode) => [promoCode.id, toFormValues(promoCode)]))
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateForm(
    key: string,
    updates: Partial<PromoCodeForm>,
    isCreate = false
  ) {
    if (isCreate) {
      setCreateForm((current) => ({ ...current, ...updates }));
      return;
    }

    setForms((current) => ({
      ...current,
      [key]: { ...(current[key] ?? toFormValues()), ...updates },
    }));
  }

  async function savePromoCode(id?: string) {
    const form = id ? forms[id] : createForm;
    if (!form) return;

    setSavingKey(id ?? "create");
    setError(null);
    setSuccess(null);

    const payload = {
      code: form.code,
      label: form.label,
      status: form.status,
      discountPercentEssentials: Number(form.discountPercentEssentials),
      discountPercentPremium: Number(form.discountPercentPremium),
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
      singleUsePerEmail: form.singleUsePerEmail,
    };

    try {
      const response = await fetch(id ? `/api/admin/promo-codes/${id}` : "/api/admin/promo-codes", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Failed to save promo code.");
        return;
      }

      setSuccess(id ? "Promo code updated." : "Promo code created.");
      setCreating(false);
      setEditingId(null);
      setCreateForm(toFormValues());
      router.refresh();
    } catch {
      setError("Network error while saving promo code.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <a href="/dashboard/billing/settings" className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Promo Codes</h1>
            <p className="text-sm text-gray-500">
              Create and manage admin-issued signup discounts.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setCreating((current) => !current);
            setError(null);
            setSuccess(null);
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
        >
          {creating ? "Cancel" : "New Promo Code"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {creating && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Create Promo Code</h2>
          <PromoCodeFormFields
            form={createForm}
            onChange={(updates) => updateForm("create", updates, true)}
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => savePromoCode()}
              disabled={savingKey === "create"}
              className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {savingKey === "create" ? "Saving..." : "Create Promo Code"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {promoCodes.map((promoCode) => {
          const isEditing = editingId === promoCode.id;
          const form = forms[promoCode.id] ?? toFormValues(promoCode);

          return (
            <div
              key={promoCode.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-lg font-semibold text-gray-900">{promoCode.code}</p>
                  <p className="text-sm text-gray-500">{promoCode.label}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Redemptions: {promoCode.redemption_count}
                    {promoCode.max_redemptions ? ` / ${promoCode.max_redemptions}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {promoCode.status}
                  </span>
                  {!isEditing ? (
                    <button
                      onClick={() => {
                        setEditingId(promoCode.id);
                        setError(null);
                        setSuccess(null);
                      }}
                      className="text-sm text-violet-600 hover:underline"
                    >
                      Edit
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-sm text-gray-500 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <>
                  <PromoCodeFormFields
                    form={form}
                    onChange={(updates) => updateForm(promoCode.id, updates)}
                  />
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => savePromoCode(promoCode.id)}
                      disabled={savingKey === promoCode.id}
                      className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50"
                    >
                      {savingKey === promoCode.id ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Essentials discount</p>
                    <p className="font-semibold text-gray-900">
                      {Math.round(Number(promoCode.discount_percent_essentials) * 100)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Premium discount</p>
                    <p className="font-semibold text-gray-900">
                      {Math.round(Number(promoCode.discount_percent_premium) * 100)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Starts</p>
                    <p className="font-semibold text-gray-900">
                      {promoCode.starts_at
                        ? new Date(promoCode.starts_at).toLocaleString()
                        : "Immediately"}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Ends</p>
                    <p className="font-semibold text-gray-900">
                      {promoCode.ends_at
                        ? new Date(promoCode.ends_at).toLocaleString()
                        : "No end date"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PromoCodeFormFields({
  form,
  onChange,
}: {
  form: PromoCodeForm;
  onChange: (updates: Partial<PromoCodeForm>) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Code</label>
        <input
          type="text"
          value={form.code}
          onChange={(event) => onChange({ code: event.target.value.toUpperCase() })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="SPRING25"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Label</label>
        <input
          type="text"
          value={form.label}
          onChange={(event) => onChange({ label: event.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Spring campaign"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Essentials discount %</label>
        <input
          type="number"
          min="0"
          max="100"
          value={form.discountPercentEssentials}
          onChange={(event) =>
            onChange({ discountPercentEssentials: event.target.value })
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Premium discount %</label>
        <input
          type="number"
          min="0"
          max="100"
          value={form.discountPercentPremium}
          onChange={(event) =>
            onChange({ discountPercentPremium: event.target.value })
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Starts at</label>
        <input
          type="datetime-local"
          value={form.startsAt}
          onChange={(event) => onChange({ startsAt: event.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Ends at</label>
        <input
          type="datetime-local"
          value={form.endsAt}
          onChange={(event) => onChange({ endsAt: event.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Max redemptions</label>
        <input
          type="number"
          min="1"
          value={form.maxRedemptions}
          onChange={(event) => onChange({ maxRedemptions: event.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Leave blank for unlimited"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
        <select
          value={form.status}
          onChange={(event) =>
            onChange({ status: event.target.value as PromoCodeStatus })
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="expired">Expired</option>
        </select>
      </div>
      <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.singleUsePerEmail}
          onChange={(event) =>
            onChange({ singleUsePerEmail: event.target.checked })
          }
          className="rounded border-gray-300 text-violet-600"
        />
        Limit each email to a single use of this code
      </label>
    </div>
  );
}
