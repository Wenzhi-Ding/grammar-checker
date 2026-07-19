// app/[lang]/page.tsx
// Server component. Renders the static, crawlable content (hero, features,
// FAQ) plus the interactive client <Polisher />. FAQ is duplicated into
// JSON-LD via faqSchema() so LLM/GEO crawlers see the same Q&A as structured
// data, not just HTML.

import { notFound } from "next/navigation";
import { getStrings, isLocale } from "@/lib/i18n";
import { faqSchema } from "@/lib/i18n/jsonld";
import { Polisher } from "./Polisher";

type PageProps = {
  params: Promise<{ lang: string }>;
};

export default async function HomePage({ params }: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const s = getStrings(lang);

  return (
    <>
      {/* Hero — crawlable <h1> + subtitle */}
      <section className="gp-hero">
        <div className="gp-hero-inner">
          <h1 className="gp-hero-h1">{s.heroH1}</h1>
          <p className="gp-hero-sub">{s.heroSub}</p>
        </div>
      </section>

      {/* Interactive editor (client) */}
      <Polisher />

      {/* Features — crawlable features list */}
      <section className="gp-features" aria-label={s.lang === "zh" ? "功能" : "Features"}>
        <div className="gp-features-inner">
          {s.features.map((f) => (
            <div className="gp-feature" key={f.title}>
              <h2 className="gp-feature-title">{f.title}</h2>
              <p className="gp-feature-body">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ — crawlable Q&A, mirrored into JSON-LD */}
      <section className="gp-faq" aria-label="FAQ">
        <div className="gp-faq-inner">
          <h2 className="gp-faq-title">
            {s.lang === "zh" ? "常见问题" : "Frequently asked questions"}
          </h2>
          {s.faq.map((item) => (
            <div className="gp-faq-item" key={item.q}>
              <h3 className="gp-faq-q">{item.q}</h3>
              <p className="gp-faq-a">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(s.lang)) }}
      />
    </>
  );
}
