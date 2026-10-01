import { EarlyAccessForm } from "./EarlyAccessForm";

export default function EarlyAccessPage() {
  return (
    <main className="ea">
      <div className="ea-field" aria-hidden="true">
        <span className="ea-bloom ea-bloom--steel" />
        <span className="ea-bloom ea-bloom--haze" />
        <span className="ea-bloom ea-bloom--navy" />
      </div>

      <p className="ea-mark">
        Teacher<span>Aid</span>
      </p>

      <section className="ea-card" aria-labelledby="ea-title">
        <h1 id="ea-title">You beat the old system.</h1>
        <p className="ea-lede">Get early access to TeacherAid.</p>
        <EarlyAccessForm />
      </section>
    </main>
  );
}
