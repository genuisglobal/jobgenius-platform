export function recruiterPartnerWorkspaceAccessEmail({
  contactName,
  companyName,
  workspaceUrl,
  expiresLabel,
}: {
  contactName: string | null;
  companyName: string;
  workspaceUrl: string;
  expiresLabel: string;
}) {
  const displayName = contactName || "there";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Access your hiring partner workspace</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f3ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 16px 40px rgba(76, 29, 149, 0.12); }
    .header { background: linear-gradient(135deg, #111827, #4c1d95 60%, #7c3aed); padding: 32px; color: #fff; }
    .header h1 { margin: 0; font-size: 28px; line-height: 1.1; }
    .header p { margin: 10px 0 0; color: rgba(255,255,255,0.82); font-size: 15px; }
    .body { padding: 32px; color: #374151; }
    .body p { font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
    .details { margin: 20px 0; padding: 18px 20px; border-radius: 14px; background: #faf5ff; border: 1px solid #e9d5ff; }
    .cta { margin-top: 28px; text-align: center; }
    .cta a { display: inline-block; padding: 14px 28px; border-radius: 999px; background: #f97316; color: #fff; text-decoration: none; font-weight: 700; }
    .footer { padding: 18px 32px 28px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Access your hiring partner workspace</h1>
        <p>No password required. One click gets you in.</p>
      </div>
      <div class="body">
        <p>Hi ${displayName},</p>
        <p>You now have optional workspace access for <strong>${companyName}</strong>.</p>
        <p>Use the link below to see your recent JobGenius hiring requests in one place and submit another role without filling out the public intake form again.</p>
        <div class="details">
          <p style="margin:0;"><strong>What this workspace is for:</strong></p>
          <p style="margin:8px 0 0;">Review your recent requests, track open items, and send another role quickly.</p>
          <p style="margin:12px 0 0;"><strong>Link expires:</strong> ${expiresLabel}</p>
        </div>
        <div class="cta">
          <a href="${workspaceUrl}">Open workspace</a>
        </div>
      </div>
      <div class="footer">
        This link is private to your hiring-side workflow with JobGenius.
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${displayName},

You now have optional workspace access for ${companyName}.

Use this link to open your JobGenius hiring partner workspace:
${workspaceUrl}

No password is required. The link expires ${expiresLabel}.

JobGenius`;

  return {
    subject: "Access your hiring partner workspace",
    html,
    text,
  };
}
