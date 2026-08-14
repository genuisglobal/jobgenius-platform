export default function CompaniesStrip() {
  return (
    <section className="py-10 border-y border-gray-100 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        <p className="text-center text-xs font-semibold text-gray-400 uppercase tracking-widest mb-7">
          Our candidates have been hired at companies like
        </p>
        <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4">
          {["Salesforce", "HubSpot", "Stripe", "Notion", "Figma", "Shopify", "Twilio", "Asana"].map((name) => (
            <span
              key={name}
              className="text-lg font-bold text-gray-300 hover:text-gray-400 transition-colors tracking-tight select-none"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
