-- ============================================================
-- Migration 075: Staff Payroll & Payslips
-- Internal HR/payroll for JobGenius staff (AMs, admins, contractors).
-- Records-only: generates payslips/contracts, tracks balances.
-- Payment happens off-platform (mark-as-paid + optional proof).
-- ============================================================

-- ─── Enums ──────────────────────────────────────────────────

CREATE TYPE employment_type AS ENUM ('full_time','part_time','contractor');
CREATE TYPE worker_status   AS ENUM ('active','on_leave','terminated');
CREATE TYPE pay_frequency   AS ENUM ('monthly','biweekly','weekly');
CREATE TYPE pay_component_kind        AS ENUM ('earning','deduction');
CREATE TYPE pay_component_category    AS ENUM ('base_salary','commission','bonus','allowance','tax','benefit','other');
CREATE TYPE pay_component_amount_type AS ENUM ('fixed','percent_of_base','percent_of_gross');
CREATE TYPE employment_contract_type   AS ENUM ('offer_letter','employment_agreement','amendment');
CREATE TYPE employment_contract_status AS ENUM ('draft','sent','signed','active','terminated');
CREATE TYPE pay_period_status AS ENUM ('draft','finalized','paid');
CREATE TYPE payslip_status    AS ENUM ('draft','issued','paid');

-- ─── payroll_workers (the "account for worker") ──────────────

CREATE TABLE payroll_workers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_manager_id UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  full_name          TEXT NOT NULL,
  email              TEXT,
  job_title          TEXT,
  department         TEXT,
  employment_type    employment_type NOT NULL DEFAULT 'full_time',
  status             worker_status   NOT NULL DEFAULT 'active',
  start_date         DATE,
  end_date           DATE,
  base_salary        NUMERIC(12,2) NOT NULL DEFAULT 0,
  pay_frequency      pay_frequency NOT NULL DEFAULT 'monthly',
  currency           TEXT NOT NULL DEFAULT 'USD',
  payout_details     TEXT,          -- shown on payslip only; not used to move money
  notes              TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── worker_pay_components (recurring earnings/deductions) ────

CREATE TABLE worker_pay_components (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id    UUID NOT NULL REFERENCES payroll_workers(id) ON DELETE CASCADE,
  kind         pay_component_kind NOT NULL,
  category     pay_component_category NOT NULL,
  label        TEXT NOT NULL,
  amount_type  pay_component_amount_type NOT NULL DEFAULT 'fixed',
  value        NUMERIC(12,2) NOT NULL DEFAULT 0,   -- fixed amount OR percent (e.g. 12.5)
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── employment_contracts (mirrors job_seeker_contracts) ─────

CREATE TABLE employment_contracts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id        UUID NOT NULL REFERENCES payroll_workers(id) ON DELETE CASCADE,
  contract_type    employment_contract_type NOT NULL DEFAULT 'offer_letter',
  title            TEXT NOT NULL,
  contract_html    TEXT,
  base_salary      NUMERIC(12,2),
  commission_terms TEXT,
  effective_date   DATE,
  end_date         DATE,
  status           employment_contract_status NOT NULL DEFAULT 'draft',
  signed_at        TIMESTAMPTZ,
  signed_ip        TEXT,
  pdf_storage_path TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── pay_periods (Phase 2 surface) ───────────────────────────

CREATE TABLE pay_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  pay_date     DATE,
  status       pay_period_status NOT NULL DEFAULT 'draft',
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── payslips (Phase 2 surface) ──────────────────────────────

CREATE TABLE payslips (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_id      UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  worker_id          UUID NOT NULL REFERENCES payroll_workers(id) ON DELETE CASCADE,
  contract_id        UUID REFERENCES employment_contracts(id) ON DELETE SET NULL,
  gross_earnings     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions   NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay            NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'USD',
  status             payslip_status NOT NULL DEFAULT 'draft',
  issued_at          TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  payment_method     TEXT,
  payment_reference  TEXT,
  proof_storage_path TEXT,
  pdf_storage_path   TEXT,
  notes              TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pay_period_id, worker_id)
);

-- ─── payslip_line_items (gross = Σ earnings, net = gross − Σ deductions) ─

CREATE TABLE payslip_line_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id UUID NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  kind       pay_component_kind NOT NULL,
  category   pay_component_category NOT NULL,
  label      TEXT NOT NULL,
  amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────

CREATE INDEX idx_payroll_workers_am     ON payroll_workers(account_manager_id);
CREATE INDEX idx_payroll_workers_status ON payroll_workers(status);
CREATE INDEX idx_pay_components_worker   ON worker_pay_components(worker_id);
CREATE INDEX idx_emp_contracts_worker    ON employment_contracts(worker_id);
CREATE INDEX idx_payslips_period         ON payslips(pay_period_id);
CREATE INDEX idx_payslips_worker         ON payslips(worker_id);
CREATE INDEX idx_payslip_items_payslip   ON payslip_line_items(payslip_id);

-- ─── Updated_at triggers (reuse existing set_updated_at()) ────

CREATE TRIGGER trg_payroll_workers_updated_at BEFORE UPDATE ON payroll_workers      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pay_components_updated_at  BEFORE UPDATE ON worker_pay_components FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_emp_contracts_updated_at   BEFORE UPDATE ON employment_contracts  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pay_periods_updated_at     BEFORE UPDATE ON pay_periods           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payslips_updated_at        BEFORE UPDATE ON payslips              FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS: service role only (all API routes use supabaseAdmin) ─

ALTER TABLE payroll_workers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_pay_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_contracts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_periods           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslip_line_items    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_payroll_workers" ON payroll_workers       FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_pay_components"  ON worker_pay_components FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_emp_contracts"   ON employment_contracts  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_pay_periods"     ON pay_periods           FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_payslips"        ON payslips              FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_payslip_items"   ON payslip_line_items    FOR ALL USING (auth.role() = 'service_role');

-- ─── Storage Bucket (private; contract/payslip PDFs + payment proof) ─

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payroll-documents',
  'payroll-documents',
  false,
  10485760,  -- 10MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "service_role_storage_payroll_documents"
  ON storage.objects FOR ALL
  USING (bucket_id = 'payroll-documents' AND auth.role() = 'service_role');
