export default function DashboardMockup() {
  return (
    <div className="relative">
      {/* Floating notification cards */}
      <div className="absolute -top-4 -left-4 z-20 bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex items-center gap-3 w-52 animate-bounce-slow">
        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-900">Interview Booked</p>
          <p className="text-xs text-gray-500">Stripe · Wed 2pm</p>
        </div>
      </div>

      <div className="absolute -bottom-4 -right-4 z-20 bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex items-center gap-3 w-52">
        <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-900">12 new applications</p>
          <p className="text-xs text-gray-500">sent this week</p>
        </div>
      </div>

      {/* Main mockup window */}
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Browser chrome */}
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-white rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-400 mx-2">
            portal.jobgenius.com
          </div>
        </div>

        {/* App content */}
        <div className="flex">
          {/* Sidebar */}
          <div className="w-14 bg-violet-700 flex flex-col items-center py-4 gap-4">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-sm" />
            </div>
            {["M", "J", "A", "I"].map((l) => (
              <div key={l} className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                {l}
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-4 bg-gray-50 space-y-3">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Applications", value: "47", color: "text-violet-700" },
                { label: "Interviews", value: "4", color: "text-orange-600" },
                { label: "Outreach", value: "23", color: "text-green-600" },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-lg p-2.5 border border-gray-100">
                  <div className={`text-lg font-extrabold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Recent Activity</p>
              <div className="space-y-2">
                {[
                  { dot: "bg-green-400", text: "Applied to Notion · Product Manager", time: "2h ago" },
                  { dot: "bg-violet-400", text: "Outreach sent to Stripe recruiter", time: "5h ago" },
                  { dot: "bg-orange-400", text: "Interview scheduled · HubSpot", time: "Yesterday" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${item.dot} flex-shrink-0`} />
                    <p className="text-xs text-gray-600 flex-1 truncate">{item.text}</p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress bar */}
            <div className="bg-white rounded-lg border border-gray-100 p-3">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold text-gray-700">Search Progress</p>
                <p className="text-xs text-violet-600 font-medium">Week 3</p>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-orange-400 rounded-full" style={{ width: "65%" }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400">Getting started</span>
                <span className="text-xs text-gray-400">Offer &#127881;</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
