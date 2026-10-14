-- ============================================================
-- Migration 094: People Ops foundation
-- Employee onboarding, probation, performance, leadership,
-- incentives, social fund, and election records.
-- ============================================================

CREATE TYPE employee_employment_status AS ENUM (
  'tentative',
  'probation',
  'permanent',
  'terminated'
);

CREATE TYPE employee_onboarding_status AS ENUM (
  'pending',
  'submitted',
  'approved',
  'needs_changes',
  'archived'
);

CREATE TYPE scorecard_status AS ENUM (
  'draft',
  'submitted',
  'finalized',
  'acknowledged'
);

CREATE TYPE probation_review_status AS ENUM (
  'draft',
  'scheduled',
  'completed'
);

CREATE TYPE probation_decision_status AS ENUM (
  'pending',
  'permanent_approved',
  'probation_failed',
  'management_review',
  'role_change_recommended'
);

CREATE TYPE leadership_pipeline_status AS ENUM (
  'not_eligible',
  'under_observation',
  'eligible_for_course',
  'enrolled_in_course',
  'completed_course',
  'ready_for_trial',
  'in_trial',
  'promoted',
  'removed'
);

CREATE TYPE leadership_course_status AS ENUM (
  'approved',
  'enrolled',
  'completed',
  'removed'
);

CREATE TYPE leadership_trial_status AS ENUM (
  'planned',
  'active',
  'completed',
  'passed',
  'failed'
);

CREATE TYPE disciplinary_record_status AS ENUM (
  'active',
  'resolved',
  'dismissed'
);

CREATE TYPE disciplinary_record_severity AS ENUM (
  'coaching',
  'warning',
  'serious'
);

CREATE TYPE accepted_offer_verification_status AS ENUM (
  'pending_verification',
  'verified',
  'rejected'
);

CREATE TYPE bonus_record_status AS ENUM (
  'pending_verification',
  'eligible',
  'approved',
  'rejected',
  'disputed'
);

CREATE TYPE bonus_payment_status AS ENUM (
  'pending',
  'scheduled',
  'paid',
  'cancelled'
);

CREATE TYPE social_fund_expense_status AS ENUM (
  'proposed',
  'approved',
  'rejected',
  'paid'
);

CREATE TYPE social_event_status AS ENUM (
  'planned',
  'completed',
  'cancelled'
);

CREATE TYPE social_election_status AS ENUM (
  'draft',
  'nominations_open',
  'voting_open',
  'closed',
  'certified',
  'cancelled'
);

CREATE TYPE social_candidate_status AS ENUM (
  'nominated',
  'approved',
  'rejected',
  'withdrawn'
);

CREATE TYPE social_lead_term_status AS ENUM (
  'active',
  'completed',
  'removed'
);

CREATE TABLE career_ladder_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'client_delivery',
  rank_order INTEGER NOT NULL,
  summary TEXT,
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL UNIQUE REFERENCES payroll_workers(id) ON DELETE CASCADE,
  account_manager_id UUID UNIQUE REFERENCES account_managers(id) ON DELETE SET NULL,
  supervisor_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  employee_code TEXT UNIQUE,
  phone_number TEXT,
  whatsapp_number TEXT,
  address_location TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  role_title TEXT,
  start_date DATE,
  probation_start_date DATE,
  probation_end_date DATE,
  employment_status employee_employment_status NOT NULL DEFAULT 'tentative',
  onboarding_status employee_onboarding_status NOT NULL DEFAULT 'pending',
  current_career_level_id UUID REFERENCES career_ladder_levels(id) ON DELETE SET NULL,
  leadership_status leadership_pipeline_status NOT NULL DEFAULT 'not_eligible',
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_onboarding_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT,
  whatsapp_number TEXT,
  address_location TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  role_title TEXT,
  start_date DATE,
  supervisor_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  employment_status employee_employment_status NOT NULL DEFAULT 'tentative',
  acknowledge_role_expectations BOOLEAN NOT NULL DEFAULT false,
  acknowledge_tentative_offer BOOLEAN NOT NULL DEFAULT false,
  acknowledge_probation_policy BOOLEAN NOT NULL DEFAULT false,
  acknowledge_bonus_policy BOOLEAN NOT NULL DEFAULT false,
  acknowledge_social_fund_policy BOOLEAN NOT NULL DEFAULT false,
  acknowledge_social_lead_policy BOOLEAN NOT NULL DEFAULT false,
  acknowledge_leadership_growth BOOLEAN NOT NULL DEFAULT false,
  signature_name TEXT,
  signature_at TIMESTAMPTZ,
  status employee_onboarding_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  manager_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_policy_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  version_label TEXT NOT NULL DEFAULT 'v1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_policy_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  policy_document_id UUID NOT NULL REFERENCES employee_policy_documents(id) ON DELETE CASCADE,
  acknowledged BOOLEAN NOT NULL DEFAULT true,
  signature_name TEXT,
  signature_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, policy_document_id)
);

CREATE TABLE scorecard_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  weight NUMERIC(5,2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE monthly_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  review_month DATE NOT NULL,
  status scorecard_status NOT NULL DEFAULT 'draft',
  final_total NUMERIC(5,2) NOT NULL DEFAULT 0,
  reviewer_account_manager_id UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  overall_comments TEXT,
  reviewed_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, review_month)
);

CREATE TABLE monthly_scorecard_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id UUID NOT NULL REFERENCES monthly_scorecards(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES scorecard_categories(id) ON DELETE CASCADE,
  numeric_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  manager_comments TEXT,
  evidence_notes TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scorecard_id, category_id)
);

CREATE TABLE probation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  review_month_index INTEGER NOT NULL CHECK (review_month_index >= 1 AND review_month_index <= 6),
  checkpoint_label TEXT NOT NULL,
  review_date DATE,
  status probation_review_status NOT NULL DEFAULT 'draft',
  successful_accepted_offers_count INTEGER NOT NULL DEFAULT 0,
  monthly_average_score NUMERIC(5,2),
  manager_notes TEXT,
  warnings_summary TEXT,
  early_permanent_eligible BOOLEAN NOT NULL DEFAULT false,
  final_decision probation_decision_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, review_month_index)
);

CREATE TABLE disciplinary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  severity disciplinary_record_severity NOT NULL DEFAULT 'coaching',
  category TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status disciplinary_record_status NOT NULL DEFAULT 'active',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leader_of_month_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  award_month DATE NOT NULL UNIQUE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  scorecard_id UUID REFERENCES monthly_scorecards(id) ON DELETE SET NULL,
  award_title TEXT NOT NULL DEFAULT 'Leader of the Month',
  reason TEXT NOT NULL,
  award_description TEXT,
  created_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leadership_eligibility_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  review_month DATE NOT NULL,
  average_score NUMERIC(5,2),
  meets_three_month_eighty BOOLEAN NOT NULL DEFAULT false,
  meets_two_of_three_eighty_five BOOLEAN NOT NULL DEFAULT false,
  has_blocking_issue BOOLEAN NOT NULL DEFAULT false,
  auto_flagged BOOLEAN NOT NULL DEFAULT false,
  status leadership_pipeline_status NOT NULL DEFAULT 'not_eligible',
  reviewed_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, review_month)
);

CREATE TABLE leadership_course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  approved_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  status leadership_course_status NOT NULL DEFAULT 'approved',
  approved_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leadership_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status leadership_trial_status NOT NULL DEFAULT 'planned',
  reviewed_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  outcome_notes TEXT,
  final_decision leadership_pipeline_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accepted_offer_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  job_seeker_id UUID REFERENCES job_seekers(id) ON DELETE SET NULL,
  offer_title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  offer_accepted_date DATE,
  background_check_completed_date DATE,
  client_start_date DATE,
  start_month DATE,
  assigned_account_manager_id UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  application_submitted_by_account_manager_id UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  interview_managed_by_account_manager_id UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  verification_status accepted_offer_verification_status NOT NULL DEFAULT 'pending_verification',
  verified_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  evidence_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee_bonus_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  accepted_offer_record_id UUID NOT NULL UNIQUE REFERENCES accepted_offer_records(id) ON DELETE CASCADE,
  bonus_eligibility_status bonus_record_status NOT NULL DEFAULT 'pending_verification',
  bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 30000,
  payment_month DATE,
  payment_status bonus_payment_status NOT NULL DEFAULT 'pending',
  approval_status bonus_record_status NOT NULL DEFAULT 'pending_verification',
  approved_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE social_fund_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accepted_offer_record_id UUID NOT NULL UNIQUE REFERENCES accepted_offer_records(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 20000,
  contribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE social_fund_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  purpose TEXT,
  requested_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  social_lead_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  status social_fund_expense_status NOT NULL DEFAULT 'proposed',
  receipt_url TEXT,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE social_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE,
  status social_event_status NOT NULL DEFAULT 'planned',
  coordinated_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE social_lead_elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  term_start DATE NOT NULL,
  term_end DATE NOT NULL,
  nominations_open_at TIMESTAMPTZ,
  nominations_close_at TIMESTAMPTZ,
  voting_open_at TIMESTAMPTZ,
  voting_close_at TIMESTAMPTZ,
  status social_election_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE social_lead_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES social_lead_elections(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status social_candidate_status NOT NULL DEFAULT 'nominated',
  nominated_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES account_managers(id) ON DELETE SET NULL,
  eligibility_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (election_id, employee_id)
);

CREATE TABLE social_lead_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES social_lead_elections(id) ON DELETE CASCADE,
  voter_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  candidate_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (election_id, voter_employee_id)
);

CREATE TABLE social_lead_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  election_id UUID REFERENCES social_lead_elections(id) ON DELETE SET NULL,
  term_number INTEGER NOT NULL DEFAULT 1,
  term_start DATE NOT NULL,
  term_end DATE NOT NULL,
  status social_lead_term_status NOT NULL DEFAULT 'active',
  removal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_account_manager ON employees(account_manager_id);
CREATE INDEX idx_employees_supervisor ON employees(supervisor_employee_id);
CREATE INDEX idx_employees_status ON employees(employment_status, onboarding_status);
CREATE INDEX idx_onboarding_status ON employee_onboarding_forms(status, submitted_at DESC);
CREATE INDEX idx_policy_ack_employee ON employee_policy_acknowledgements(employee_id);
CREATE INDEX idx_scorecards_employee_month ON monthly_scorecards(employee_id, review_month DESC);
CREATE INDEX idx_probation_employee_month ON probation_reviews(employee_id, review_month_index);
CREATE INDEX idx_disciplinary_employee_status ON disciplinary_records(employee_id, status, opened_at DESC);
CREATE INDEX idx_leadership_employee_month ON leadership_eligibility_records(employee_id, review_month DESC);
CREATE INDEX idx_accepted_offers_employee ON accepted_offer_records(employee_id, client_start_date DESC);
CREATE INDEX idx_bonus_employee_payment ON employee_bonus_records(employee_id, payment_month DESC);
CREATE INDEX idx_social_expenses_status ON social_fund_expenses(status, created_at DESC);
CREATE INDEX idx_social_votes_election ON social_lead_votes(election_id, candidate_employee_id);

CREATE TRIGGER trg_career_ladder_levels_updated_at
  BEFORE UPDATE ON career_ladder_levels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_employee_onboarding_forms_updated_at
  BEFORE UPDATE ON employee_onboarding_forms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_employee_policy_documents_updated_at
  BEFORE UPDATE ON employee_policy_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_scorecard_categories_updated_at
  BEFORE UPDATE ON scorecard_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_monthly_scorecards_updated_at
  BEFORE UPDATE ON monthly_scorecards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_monthly_scorecard_items_updated_at
  BEFORE UPDATE ON monthly_scorecard_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_probation_reviews_updated_at
  BEFORE UPDATE ON probation_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_disciplinary_records_updated_at
  BEFORE UPDATE ON disciplinary_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leader_of_month_awards_updated_at
  BEFORE UPDATE ON leader_of_month_awards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leadership_eligibility_records_updated_at
  BEFORE UPDATE ON leadership_eligibility_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leadership_course_enrollments_updated_at
  BEFORE UPDATE ON leadership_course_enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leadership_trials_updated_at
  BEFORE UPDATE ON leadership_trials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_accepted_offer_records_updated_at
  BEFORE UPDATE ON accepted_offer_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_employee_bonus_records_updated_at
  BEFORE UPDATE ON employee_bonus_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_social_fund_contributions_updated_at
  BEFORE UPDATE ON social_fund_contributions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_social_fund_expenses_updated_at
  BEFORE UPDATE ON social_fund_expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_social_events_updated_at
  BEFORE UPDATE ON social_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_social_lead_elections_updated_at
  BEFORE UPDATE ON social_lead_elections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_social_lead_candidates_updated_at
  BEFORE UPDATE ON social_lead_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_social_lead_terms_updated_at
  BEFORE UPDATE ON social_lead_terms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE career_ladder_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_onboarding_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_policy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_policy_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_scorecard_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE probation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leader_of_month_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadership_eligibility_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadership_course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE leadership_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE accepted_offer_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_bonus_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_fund_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_fund_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_lead_elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_lead_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_lead_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_lead_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_career_ladder_levels"
  ON career_ladder_levels FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_employees"
  ON employees FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_employee_onboarding_forms"
  ON employee_onboarding_forms FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_employee_policy_documents"
  ON employee_policy_documents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_employee_policy_acknowledgements"
  ON employee_policy_acknowledgements FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_scorecard_categories"
  ON scorecard_categories FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_monthly_scorecards"
  ON monthly_scorecards FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_monthly_scorecard_items"
  ON monthly_scorecard_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_probation_reviews"
  ON probation_reviews FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_disciplinary_records"
  ON disciplinary_records FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_leader_of_month_awards"
  ON leader_of_month_awards FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_leadership_eligibility_records"
  ON leadership_eligibility_records FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_leadership_course_enrollments"
  ON leadership_course_enrollments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_leadership_trials"
  ON leadership_trials FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_accepted_offer_records"
  ON accepted_offer_records FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_employee_bonus_records"
  ON employee_bonus_records FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_social_fund_contributions"
  ON social_fund_contributions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_social_fund_expenses"
  ON social_fund_expenses FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_social_events"
  ON social_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_social_lead_elections"
  ON social_lead_elections FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_social_lead_candidates"
  ON social_lead_candidates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_social_lead_votes"
  ON social_lead_votes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_social_lead_terms"
  ON social_lead_terms FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO career_ladder_levels (slug, title, rank_order, summary, requirements)
VALUES
  (
    'career-service-consultant-trainee',
    'Career Service Consultant Trainee',
    1,
    'Entry stage focused on learning JobGenuis workflows, discipline, and supervised delivery.',
    '["Complete onboarding and probation requirements","Demonstrate reporting discipline","Show coachability and ethical conduct"]'::jsonb
  ),
  (
    'career-service-consultant',
    'Career Service Consultant',
    2,
    'Owns seeker delivery with consistent reporting and accountable execution.',
    '["Pass probation review","Deliver quality job applications","Maintain reliable communication and reporting"]'::jsonb
  ),
  (
    'senior-career-service-consultant',
    'Senior Career Service Consultant',
    3,
    'High-performing consultant with stronger execution quality and mentoring potential.',
    '["Sustain strong monthly scorecards","Contribute accepted offers ethically","Show initiative and peer support"]'::jsonb
  ),
  (
    'team-lead',
    'Team Lead',
    4,
    'Leads a small delivery group and supports quality control, coaching, and execution.',
    '["Qualify for leadership pipeline","Complete leadership course","Pass a leadership trial assignment"]'::jsonb
  ),
  (
    'operations-assistant',
    'Operations Assistant',
    5,
    'Supports operations coordination, reporting discipline, and team systems.',
    '["Show process ownership","Strong communication and reliability","Consistent values alignment"]'::jsonb
  ),
  (
    'operations-manager',
    'Operations Manager',
    6,
    'Owns people execution, review quality, and operational performance management.',
    '["Demonstrated leadership performance","Trusted judgment and integrity","Successful delivery oversight"]'::jsonb
  ),
  (
    'head-of-client-delivery',
    'Head of Client Delivery',
    7,
    'Leads delivery quality, standards, and team performance across the function.',
    '["Strong sustained leadership record","Excellent performance outcomes","Trusted steward of company standards"]'::jsonb
  )
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  department = EXCLUDED.department,
  rank_order = EXCLUDED.rank_order,
  summary = EXCLUDED.summary,
  requirements = EXCLUDED.requirements;

INSERT INTO scorecard_categories (slug, label, weight, sort_order)
VALUES
  ('task_execution_productivity', 'Task execution and productivity', 25, 1),
  ('quality_of_work', 'Quality of work', 20, 2),
  ('communication_reporting', 'Communication and reporting', 15, 3),
  ('discipline_reliability', 'Discipline and reliability', 15, 4),
  ('values_attitude', 'Values and attitude', 15, 5),
  ('initiative_problem_solving', 'Initiative and problem-solving', 10, 6)
ON CONFLICT (slug) DO UPDATE
SET
  label = EXCLUDED.label,
  weight = EXCLUDED.weight,
  sort_order = EXCLUDED.sort_order;

INSERT INTO employee_policy_documents (policy_key, title, body, version_label, sort_order)
VALUES
  (
    'role_expectations',
    'Role Expectations',
    'JobGenuis employees are expected to manage assigned jobseekers professionally, submit quality job applications, manage interview communication, maintain daily and weekly reports, protect client information, follow company SOPs, maintain discipline and integrity, and work toward measurable client outcomes.',
    'v1',
    1
  ),
  (
    'tentative_offer',
    'Tentative Offer and Probation',
    'New hires receive a tentative offer first and enter a performance-based probation period. Probation can last up to 6 months. Early permanent contract eligibility may be earned by contributing to 3 successful accepted client job offers before the 6-month review.',
    'v1',
    2
  ),
  (
    'probation_policy',
    'Probation Review Policy',
    'At the 6-month review, management evaluates performance, conduct, values alignment, reporting, communication, quality of work, and company fit. If the employee does not pass probation, the employment relationship may be discontinued according to company policy and applicable labor requirements.',
    'v1',
    3
  ),
  (
    'bonus_policy',
    'Bonus Policy',
    'The eligible Account Manager receives 30,000 FCFA for every successful accepted offer. Bonus eligibility requires documented work, ethical conduct, and no unresolved fraud, misrepresentation, or client ownership dispute.',
    'v1',
    4
  ),
  (
    'social_fund_policy',
    'Employee Social Fund Policy',
    'For every successful accepted offer, 20,000 FCFA is added to the employee social fund. The fund supports approved employee social events, bonding, team appreciation, and welfare-related activities, with transparent records, approval, and receipts.',
    'v1',
    5
  ),
  (
    'social_lead_policy',
    'Social Lead Policy',
    'Social Leads are elected every 3 months, can serve a maximum of 2 terms, and must meet tenure, performance, and conduct eligibility requirements. Social Leads coordinate activities but do not have uncontrolled financial authority.',
    'v1',
    6
  ),
  (
    'leadership_growth',
    'Leadership Growth Philosophy',
    'Leadership at JobGenuis is earned through consistent execution, integrity, accountability, discipline, service, communication, measurable results, values alignment, and leadership potential.',
    'v1',
    7
  ),
  (
    'confidentiality',
    'Confidentiality',
    'Employees agree to protect client data, resumes, login details, salary and offer information, interview schedules, internal SOPs, templates, pricing, strategy, and any other confidential company or client information.',
    'v1',
    8
  ),
  (
    'non_solicitation',
    'Non-Solicitation',
    'Employees agree not to divert, privately serve, or accept side payments from JobGenuis clients, jobseekers, recruiters, partners, or leads accessed through the company during employment and for any lawful restricted period after departure.',
    'v1',
    9
  ),
  (
    'conflict_of_interest',
    'Conflict of Interest',
    'Employees agree not to secretly operate a competing job placement or career service business, redirect clients outside JobGenuis, or use company resources for private gain.',
    'v1',
    10
  ),
  (
    'company_property',
    'Company Property and Data',
    'Templates, SOPs, systems, reports, trackers, dashboards, training materials, client files, internal documentation, and CRM records are company property and must be handled accordingly.',
    'v1',
    11
  ),
  (
    'ethical_conduct',
    'Ethical Conduct',
    'Employees agree not to falsify resumes, invent experience, misrepresent clients, promise guaranteed jobs, submit unauthorized applications, or engage in dishonest communication.',
    'v1',
    12
  ),
  (
    'escalation',
    'Escalation and Reporting',
    'Employees agree to escalate client complaints, offer disputes, recruiter issues, login or OTP problems, payment issues, background check issues, and ethical concerns to management promptly.',
    'v1',
    13
  )
ON CONFLICT (policy_key) DO UPDATE
SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  version_label = EXCLUDED.version_label,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  requires_acknowledgement = true;
