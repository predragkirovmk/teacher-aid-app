import type { Metadata } from "next";
import { Golos_Text } from "next/font/google";
import Link from "next/link";
import "./site.css";

const golos = Golos_Text({ variable: "--font-golos", subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  title: "TeacherAid · 404",
  description: "Оваа страница не постои. This page does not exist.",
};

export default function GlobalNotFound() {
  return (
    <html lang="mk" className={golos.variable}>
      <body>
        <div className="site">
          <div className="field" aria-hidden="true">
            <div className="field__blooms">
              <span className="field__bloom field__bloom--steel" />
              <span className="field__bloom field__bloom--haze" />
              <span className="field__bloom field__bloom--navy" />
            </div>
          </div>
          <main className="wrap lost">
            <p className="numeral lost__num">404</p>
            <h1 className="display display--m">Ова прашање нема одговор.</h1>
            <p className="lead" lang="en">
              This page does not exist.
            </p>
            <div className="lost__actions">
              <Link className="btn btn--primary" href="/">
                Почетна
              </Link>
              <Link className="btn btn--ghost" href="/en" lang="en">
                English
              </Link>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
