import type { Metadata, Viewport } from "next";
import { Geologica, Golos_Text } from "next/font/google";
import type { SiteV2Dict } from "@/content/site-v2/types";
import "@/app/site-v2.css";

// Geologica sets the display lines, Golos Text (the apps' font) everything else. Both are
// variable, so one file per subset covers every weight.
const geologica = Geologica({
  variable: "--font-geologica",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// The main domain; previews and local builds point at themselves. Not imported from the first
// site's document, which would bring its stylesheet along.
const siteUrl =
  process.env.VERCEL_ENV === "production"
    ? "https://teacheraid.education"
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

export function siteV2Metadata(t: SiteV2Dict): Metadata {
  const path = t.lang === "mk" ? "/v2" : "/v2/en";
  return {
    metadataBase: new URL(siteUrl),
    title: t.meta.title,
    description: t.meta.description,
    applicationName: "TeacherAid",
    // Not indexed until the owner moves it onto the main address.
    robots: { index: false, follow: false },
    alternates: { canonical: path, languages: { mk: "/v2", en: "/v2/en" } },
    openGraph: {
      type: "website",
      url: path,
      siteName: "TeacherAid",
      title: t.meta.title,
      description: t.meta.description,
      locale: t.lang === "mk" ? "mk_MK" : "en_US",
    },
  };
}

export const siteV2Viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f9f9",
  colorScheme: "light",
};

// Adds `motion` before first paint so scroll-revealed content starts hidden only when the motion
// layer is coming; if it has not arrived after a few seconds, everything shows as it is.
const motionGuard = `(function(){try{var d=document.documentElement;if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('motion');setTimeout(function(){if(!window.__taMotion)d.classList.remove('motion')},3500)}}catch(e){}})();`;

export function SiteV2Document({ lang, children }: { lang: "mk" | "en"; children: React.ReactNode }) {
  return (
    <html lang={lang} className={`${geologica.variable} ${golos.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: motionGuard }} />
      </head>
      <body className="v2">{children}</body>
    </html>
  );
}
