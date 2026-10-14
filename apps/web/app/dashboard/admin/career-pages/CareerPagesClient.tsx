"use client";

import { useEffect, useState, useCallback } from "react";

interface CareerPage {
  id: string;
  company_name: string;
  career_url: string;
  ats_type: string | null;
  board_token: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  jobs_found: number;
  check_frequency: string;
  created_at: string;
}

export default function CareerPagesClient() {
  const [pages, setPages] = useState<CareerPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState<any>(null);

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [careerUrl, setCareerUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchPages = useCallback(async () => {
    const res = await fetch("/api/am/career-pages?active=false");
    if (res.ok) {
      const data = await res.json();
      setPages(data.career_pages ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  const handleAdd = async () => {
    if (!companyName || !careerUrl) return;
    setAdding(true);
    const res = await fetch("/api/am/career-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: companyName, career_url: careerUrl }),
    });
    if (res.ok) {
      setCompanyName("");
      setCareerUrl("");
      setShowAdd(false);
      fetchPages();
    }
    setAdding(false);
  };

  const toggleActive = async (page: CareerPage) => {
    await fetch("/api/am/career-pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: page.id, is_active: !page.is_active }),
    });
    fetchPages();
  };

  const handleCrawl = async () => {
    setCrawling(true);
    setCrawlResult(null);
    const res = await fetch("/api/admin/career-crawl", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setCrawlResult(data);
    }
    setCrawling(false);
    fetchPages();
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading career pages...</div>;
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Monitored Career Pages</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track startup and company career pages for new job postings
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-md hover:bg-violet-700"
          >
            + Add Company
          </button>
          <button
            onClick={handleCrawl}
            disabled={crawling}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {crawling ? "Crawling..." : "Crawl Now"}
          </button>
        </div>
      </div>

      {crawlResult && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
          <p className="font-medium text-green-800">
            Crawled {crawlResult.pages_crawled} pages — {crawlResult.total_jobs} jobs found
          </p>
          {crawlResult.results?.map((r: any, i: number) => (
            <p key={i} className="text-green-700 mt-1">
              {r.company} ({r.ats}): {r.jobs_found} jobs
              {r.error && <span className="text-red-600"> — {r.error}</span>}
            </p>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-semibold mb-3">Add Career Page</h3>
          <p className="text-xs text-gray-500 mb-3">
            Paste a Greenhouse, Lever, Ashby, Workday, or SmartRecruiters careers page URL. ATS type and board token are auto-detected.
          </p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Stripe"
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div className="flex-[2]">
              <label className="block text-xs font-medium text-gray-600 mb-1">Career Page URL</label>
              <input
                type="url"
                value={careerUrl}
                onChange={(e) => setCareerUrl(e.target.value)}
                placeholder="e.g., https://jobs.smartrecruiters.com/Stripe"
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || !companyName || !careerUrl}
              className="px-4 py-2 text-sm bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {pages.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No career pages monitored yet</p>
          <p className="text-sm mt-1">Add company career pages to track new job postings automatically</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ATS</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jobs Found</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Checked</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Frequency</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <a
                      href={page.career_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 hover:underline font-medium"
                    >
                      {page.company_name}
                    </a>
                    {page.board_token && (
                      <span className="ml-2 text-xs text-gray-400">({page.board_token})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {page.ats_type ?? "unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{page.jobs_found}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {page.last_checked_at
                      ? new Date(page.last_checked_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{page.check_frequency}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(page)}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        page.is_active
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-red-100 text-red-700 hover:bg-red-200"
                      }`}
                    >
                      {page.is_active ? "Active" : "Paused"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
