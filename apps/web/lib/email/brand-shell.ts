import { BRAND } from "@/lib/brand";

/**
 * Wrap transactional email content in the JobGenius brand shell — a violet/
 * orange two-tone wordmark header and a consistent footer. Pass the inner HTML
 * (tables, paragraphs, CTAs); this provides the chrome.
 */
export function brandEmailShell(innerHtml: string): string {
  return `
  <div style="background:#f3f4f6;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BRAND.gray200};">
      <div style="padding:18px 24px;border-bottom:1px solid ${BRAND.gray200};">
        <span style="font-size:18px;font-weight:700;letter-spacing:-0.01em;">
          <span style="color:${BRAND.violet};">Job</span><span style="color:${BRAND.orange};">Genius</span>
        </span>
      </div>
      <div style="padding:24px;color:${BRAND.ink};line-height:1.55;">
        ${innerHtml}
      </div>
      <div style="padding:14px 24px;border-top:1px solid ${BRAND.gray200};color:${BRAND.gray};font-size:12px;">
        JobGenius · Career Services &amp; Job Search Coordination
      </div>
    </div>
  </div>`;
}

/** A brand-violet call-to-action button for use inside email bodies. */
export function brandCtaButton(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND.violet};color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">${text}</a>`;
}
