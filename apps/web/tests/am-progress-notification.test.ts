import { describe, expect, it } from "vitest";
import { amProgressNotificationHtml } from "@/lib/email-templates/am-progress-notification";

describe("AM progress email layout", () => {
  it("shows weekly statistics, client detail, and the branded footer", () => {
    const html = amProgressNotificationHtml("Your week", "Applications: 60 (up 10 from last week).\nPhone interviews: 2 (up 1).\nClient detail:\n  Client A: 30 applications, 1 phone interview.\nYour measured productivity details:\nApplications: 60 (30 easy, 30 company)", "/dashboard/productivity", true);
    expect(html).toContain("jobgenius-email-logo.png");
    expect(html).toContain("60</div>");
    expect(html).toContain("up 10 from last week");
    expect(html).toContain("Client A: 30 applications");
    expect(html.match(/>Applications<\/div>/g)).toHaveLength(1);
    expect(html).toContain("https://job-genius.com/dashboard/productivity");
  });

  it("escapes sheet names and other notification text before putting it in HTML", () => {
    const html = amProgressNotificationHtml("Hi <script>", "Per-client progress:\n  <img src=x onerror=alert(1)>: 20 applications", "/dashboard/today", false);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
