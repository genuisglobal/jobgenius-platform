import type { MetadataRoute } from "next";

const SITE_URL = "https://job-genius.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/portal/",
          "/dashboard/",
          "/login",
          "/signup",
          "/reset-password",
          "/pending-approval",
          "/account-rejected",
          "/interview-confirm/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
