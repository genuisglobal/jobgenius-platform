// A second delivery window for afternoon check-in reminders and Friday digests.
// Reuse the same authenticated queue drain and its idempotent pending filter.
export { GET } from "../drain-notifications/route";
