import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

const apiBaseUrl = normalizeBaseUrl(
  pickFirstNonEmpty(process.env.API_BASE_URL, process.env.JOBGENIUS_API_BASE_URL)
);
const authToken = pickFirstNonEmpty(
  process.env.RUNNER_AUTH_TOKEN,
  process.env.JOBGENIUS_API_KEY
);
const authEnvName = pickFirstNonEmpty(process.env.RUNNER_AUTH_TOKEN)
  ? "RUNNER_AUTH_TOKEN"
  : pickFirstNonEmpty(process.env.JOBGENIUS_API_KEY)
    ? "JOBGENIUS_API_KEY"
    : "none";
const tokensDiffer =
  pickFirstNonEmpty(process.env.RUNNER_AUTH_TOKEN) &&
  pickFirstNonEmpty(process.env.JOBGENIUS_API_KEY) &&
  pickFirstNonEmpty(process.env.RUNNER_AUTH_TOKEN) !== pickFirstNonEmpty(process.env.JOBGENIUS_API_KEY);

if (!apiBaseUrl) {
  console.error("[runner-auth-check] API_BASE_URL is required.");
  process.exit(1);
}

if (!authToken) {
  console.error(
    "[runner-auth-check] RUNNER_AUTH_TOKEN is required. JOBGENIUS_API_KEY is supported only as a legacy alias."
  );
  process.exit(1);
}

console.log("[runner-auth-check] Starting auth check.");
console.log(`[runner-auth-check] API base URL: ${apiBaseUrl}`);
console.log(`[runner-auth-check] Auth env detected: ${authEnvName}`);
console.log("[runner-auth-check] Probe route: GET /api/dashboard/global-jobs?page=1&limit=1");
if (tokensDiffer) {
  console.warn(
    "[runner-auth-check] RUNNER_AUTH_TOKEN and JOBGENIUS_API_KEY differ. The check uses RUNNER_AUTH_TOKEN."
  );
}

try {
  const response = await axios.get(`${apiBaseUrl}/api/dashboard/global-jobs`, {
    timeout: 15000,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${authToken}`,
      "x-api-key": authToken,
      "x-runner": "cloud",
      "x-runner-id": "runner-auth-check",
    },
    params: { page: 1, limit: 1 },
  });

  console.log(
    `[runner-auth-check] Auth OK. Status ${response.status}. The runner should be able to reach apply claim routes with the same bearer token.`
  );
} catch (error) {
  const status = error?.response?.status ?? "unknown";
  const body =
    error?.response?.data && typeof error.response.data === "object"
      ? JSON.stringify(error.response.data)
      : error?.response?.data ?? error?.message ?? String(error);

  console.error(`[runner-auth-check] Auth failed. Status ${status}.`);
  console.error(`[runner-auth-check] Response: ${body}`);
  console.error(
    "[runner-auth-check] Backend apply routes expect Authorization: Bearer <RUNNER_AUTH_TOKEN> and require RUNNER_AM_EMAIL on the backend."
  );
  process.exit(1);
}
