export function recruiterIntakeConfirmationEmail({
  contactName,
  companyName,
  roleTitle,
  jobUrl,
  location,
  personaType,
  hireUrl,
  actionUrls,
}: {
  contactName: string | null;
  companyName: string;
  roleTitle: string | null;
  jobUrl: string | null;
  location: string;
  personaType: "in_house" | "agency";
  hireUrl: string;
  actionUrls: {
    send_profiles: string;
    add_details: string;
    not_hiring: string;
    wrong_contact: string;
    refer_teammate: string;
  };
}) {
  const displayName = contactName || "there";
  const roleLine = roleTitle || "your hiring request";
  const audienceLine =
    personaType === "agency"
      ? "We have your agency request and will review it quickly."
      : "We have your hiring request and will review it quickly.";

  const detailRows = [
    `<li><strong>Company:</strong> ${companyName}</li>`,
    roleTitle ? `<li><strong>Role:</strong> ${roleTitle}</li>` : "",
    `<li><strong>Location:</strong> ${location}</li>`,
    jobUrl
      ? `<li><strong>Job link:</strong> <a href="${jobUrl}" style="color:#7c3aed">${jobUrl}</a></li>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>We received your hiring request</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f3ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 16px 40px rgba(76, 29, 149, 0.12); }
    .header { background: linear-gradient(135deg, #2e1065, #7c3aed 65%, #9333ea); padding: 32px; color: #fff; }
    .header h1 { margin: 0; font-size: 28px; line-height: 1.1; }
    .header p { margin: 10px 0 0; color: rgba(255,255,255,0.82); font-size: 15px; }
    .body { padding: 32px; color: #374151; }
    .body p { font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
    .details { margin: 20px 0; padding: 18px 20px; border-radius: 14px; background: #faf5ff; border: 1px solid #e9d5ff; }
    .details ul { margin: 0; padding-left: 18px; }
    .details li { margin-bottom: 10px; }
    .actions { margin: 24px 0 4px; }
    .actions p { margin-bottom: 12px; }
    .actions-grid { display: grid; gap: 10px; }
    .action-link { display: block; border-radius: 12px; padding: 12px 14px; text-decoration: none; font-weight: 700; text-align: center; }
    .action-primary { background: #f97316; color: #fff; }
    .action-secondary { background: #ede9fe; color: #4c1d95; }
    .action-muted { background: #f3f4f6; color: #374151; }
    .cta { margin-top: 28px; text-align: center; }
    .cta a { display: inline-block; padding: 14px 28px; border-radius: 999px; background: #f97316; color: #fff; text-decoration: none; font-weight: 700; }
    .footer { padding: 18px 32px 28px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>We received your hiring request</h1>
        <p>No account setup is required. We will reply directly by email.</p>
      </div>
      <div class="body">
        <p>Hi ${displayName},</p>
        <p>${audienceLine}</p>
        <p>There is no password to create and no platform setup to complete. If we need more detail or have relevant candidates, we will email you directly within 1 business day.</p>
        <div class="details">
          <ul>${detailRows}</ul>
        </div>
        <p>What happens next:</p>
        <p>1. We review the request for fit and urgency.</p>
        <p>2. If useful, we reply with follow-up questions or matched candidate profiles.</p>
        <p>3. If you end up working with us repeatedly, we can give you optional partner access later.</p>
        <div class="actions">
          <p><strong>One-click actions:</strong></p>
          <div class="actions-grid">
            <a class="action-link action-primary" href="${actionUrls.send_profiles}">Send profiles</a>
            <a class="action-link action-secondary" href="${actionUrls.add_details}">Add more details</a>
            <a class="action-link action-secondary" href="${actionUrls.refer_teammate}">Refer teammate</a>
            <a class="action-link action-muted" href="${actionUrls.not_hiring}">Not hiring right now</a>
            <a class="action-link action-muted" href="${actionUrls.wrong_contact}">Wrong contact</a>
          </div>
        </div>
        <div class="cta">
          <a href="${hireUrl}">Submit another role</a>
        </div>
      </div>
      <div class="footer">
        Requested role: ${roleLine}
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${displayName},

We received your hiring request for ${roleLine}.

Company: ${companyName}
Location: ${location}
${jobUrl ? `Job link: ${jobUrl}\n` : ""}No account setup is required. We will review this and reply directly by email within 1 business day if we need more detail or have relevant candidates.

Quick actions:
- Send profiles: ${actionUrls.send_profiles}
- Add more details: ${actionUrls.add_details}
- Refer teammate: ${actionUrls.refer_teammate}
- Not hiring right now: ${actionUrls.not_hiring}
- Wrong contact: ${actionUrls.wrong_contact}

Submit another role: ${hireUrl}

JobGenius`;

  return {
    subject: "We received your hiring request",
    html,
    text,
  };
}
