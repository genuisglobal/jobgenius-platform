import ScrollReveal from "../ScrollReveal";
import { SUCCESS_STORIES, SUCCESS_STORIES_DISCLAIMER } from "./marketingContent";

function SuccessStoryCard({
  name,
  role,
  result,
  story,
  resultLine,
  linkedInUrl,
  photoUrl,
  quote,
  initials,
  accentClass,
  badgeClass,
}: (typeof SUCCESS_STORIES)[number]) {
  const hasLinkedIn = Boolean(linkedInUrl);
  const hasPhoto = Boolean(photoUrl);
  const hasQuote = Boolean(quote);

  return (
    <article className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <div className={`h-2 w-full bg-gradient-to-r ${accentClass}`} />
      <div className="p-7 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-sm font-bold text-gray-700">
              {hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={`${name} photo`} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">{name}</h3>
              <p className="mt-1 text-sm text-gray-500">{role}</p>
            </div>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
            {result}
          </span>
        </div>

        <div className="mt-6 space-y-4 text-sm leading-7 text-gray-700">
          {story.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p className="font-semibold text-gray-900">{resultLine}</p>
        </div>

        <div className="mt-6 grid gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
          <p>
            <span className="font-semibold text-gray-900">LinkedIn profile:</span>{" "}
            {hasLinkedIn ? "Approved link attached." : "Placeholder pending client approval."}
          </p>
          <p>
            <span className="font-semibold text-gray-900">Client photo:</span>{" "}
            {hasPhoto ? "Approved photo attached." : "Optional placeholder pending client approval."}
          </p>
          <p>
            <span className="font-semibold text-gray-900">Testimonial quote:</span>{" "}
            {hasQuote ? quote : "Optional quote placeholder pending client approval."}
          </p>
        </div>

        {hasLinkedIn ? (
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
          >
            View LinkedIn Profile
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="mt-6 inline-flex cursor-not-allowed rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-400"
          >
            View LinkedIn Profile
          </span>
        )}
      </div>
    </article>
  );
}

export default function TestimonialsSection() {
  return (
    <section className="bg-gray-50 py-20 sm:py-28">
      <ScrollReveal>
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <p className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-violet-600">
            Success Stories
          </p>
          <h2 className="mb-4 text-center text-3xl font-bold text-gray-900 sm:text-4xl">
            Real client outcomes, presented with more context
          </h2>
          <p className="mx-auto mb-14 max-w-3xl text-center text-gray-500">
            These examples show the type of positioning, application support, and campaign
            execution JobGenius provides. They are not promises of identical results.
          </p>

          <div className="grid gap-8">
            {SUCCESS_STORIES.map((story) => (
              <SuccessStoryCard key={story.name} {...story} />
            ))}
          </div>

          <p className="mx-auto mt-8 max-w-4xl text-center text-sm leading-6 text-gray-500">
            {SUCCESS_STORIES_DISCLAIMER}
          </p>
        </div>
      </ScrollReveal>
    </section>
  );
}
