import type { Metadata } from "next";
import { Geologica, Golos_Text } from "next/font/google";
import Link from "next/link";
import "./site-v2.css";

const geologica = Geologica({ variable: "--font-geologica", subsets: ["latin", "cyrillic"], display: "swap" });
const golos = Golos_Text({ variable: "--font-golos", subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  title: "TeacherAid · 404",
  description: "Оваа страница не постои. This page does not exist.",
};

export default function GlobalNotFound() {
  return (
    <html lang="mk" className={`${geologica.variable} ${golos.variable}`}>
      <body className="v2">
        <main className="wrap lost">
          <p className="kicker kicker--deep">404</p>
          <h1 className="display">Ова прашање нема одговор.</h1>
          <p className="lead lost__en" lang="en">
            This page does not exist.
          </p>
          <div className="actions">
            <Link className="btn btn--primary" href="/">
              Почетна
            </Link>
            <Link className="chev" href="/en" lang="en">
              English
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
