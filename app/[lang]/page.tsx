// app/[lang]/page.tsx
// Server component. Google-Translate-style: interactive editor comes FIRST,
// all crawlable SEO content (hero text + features + FAQ) lives BELOW the
// editor so it doesn't push the editor below the fold. H1 and all SEO
// copy are still server-rendered in the HTML, so Google/LLM crawlers see
// them — they're just visually below the fold, which is fine for SEO.

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
      {/* Interactive editor (client) — first thing the user sees */}
      <Polisher />

      {/* SEO content — below the fold.
          H1 + hero copy are kept here (not deleted) because Google indexes
          the full DOM, not just the visible viewport. The H1 in this section
          is the page's primary <h1>. */}
      <section className="gp-seo-hero" aria-label={s.lang === "zh" ? "关于此工具" : "About this tool"}>
        <div className="gp-seo-hero-inner">
          <h1 className="gp-seo-h1">{s.heroH1}</h1>
          <p className="gp-seo-sub">{s.heroSub}</p>
        </div>
      </section>

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
