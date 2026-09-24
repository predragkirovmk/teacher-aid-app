import type { SiteDict } from "@/content/site/types";
import { Contact, Footer } from "./Closing";
import { Hero } from "./Hero";
import { Motion } from "./Motion";
import { Nav } from "./Nav";
import { Country, Lesson, Problem, Report, Teacher, Trust, Why } from "./Story";

// The design system's moving field: a midnight base with three drifting blooms and a sheen.
// It sits behind the whole page; glass floats directly on it.
function Field() {
  return (
    <div className="field" aria-hidden="true">
      <div className="field__blooms" data-field-blooms>
        <span className="field__bloom field__bloom--steel" />
        <span className="field__bloom field__bloom--haze" />
        <span className="field__bloom field__bloom--navy" />
      </div>
      <span className="field__sheen" />
    </div>
  );
}

export function SitePage({ t }: { t: SiteDict }) {
  return (
    <Motion>
      <Field />
      <Nav t={t.nav} contactHref="#contact" />
      <main id="main" tabIndex={-1}>
        <Hero t={t.hero} contactHref="#contact" />
        <Problem t={t.problem} />
        <Lesson t={t.lesson} />
        <Why t={t.why} />
        <Teacher t={t.teacher} />
        <Report t={t.report} />
        <Trust t={t.trust} />
        <Country t={t.country} lang={t.lang} />
        <Contact t={t.contact} />
      </main>
      <Footer t={t.footer} contact={t.contact} nav={t.nav} />
    </Motion>
  );
}
