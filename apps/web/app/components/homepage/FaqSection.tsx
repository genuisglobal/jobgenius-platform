import ScrollReveal from "../ScrollReveal";
import FaqAccordion from "../FaqAccordion";

export default function FaqSection() {
  return (
    <section id="faq" className="py-20 sm:py-28 bg-white">
      <ScrollReveal>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          <p className="text-center text-violet-600 font-semibold text-sm uppercase tracking-wider mb-3">
            FAQ
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-4">
            Common questions, answered
          </h2>
          <p className="text-center text-gray-500 max-w-2xl mx-auto mb-12">
            Still on the fence? Here are the questions we hear most often from job seekers before they sign up.
          </p>
          <FaqAccordion />
        </div>
      </ScrollReveal>
    </section>
  );
}
