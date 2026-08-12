// Decision taxonomy for the Act/Ask/Escalate engine (Org Singularity).
// Encodes the course's decision rules as machine-readable codes.

export type DecisionVerdict = "act" | "ask" | "escalate" | "pause";

export type DecisionSubjectType =
  | "job"
  | "application"
  | "application_question"
  | "recruiter_message"
  | "inbound_email"
  | "offer";

export type DecisionRiskCategory =
  | "none"
  | "sensitive"
  | "financial"
  | "legal"
  | "scam"
  | "contractual";

export type ReasonCode =
  | "ALL_CLEAR"
  | "UNCONFIRMED_SENSITIVE_FIELD"
  | "LEGAL_OR_CONTRACTUAL"
  | "OFFER_TERMS"
  | "SCAM_RED_FLAG"
  | "CLIENT_INPUT_REQUIRED"
  | "DEAL_BREAKER"
  | "MISSING_JD";
