import type { Metadata, Viewport } from "next";
import { Golos_Text } from "next/font/google";
import type { SiteDict } from "@/content/site/types";
import "@/app/site.css";

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const siteUrl = productionHost ? `https://${productionHost}` : "http://localhost:3000";

export function siteMetadata(t: SiteDict): Metadata {
  const path = t.lang === "mk" ? "/" : "/en";
  return {
    metadataBase: new URL(siteUrl),
    title: t.meta.title,
    description: t.meta.description,
    applicationName: "TeacherAid",
    alternates: { canonical: path, languages: { mk: "/", en: "/en", "x-default": "/" } },
    openGraph: {
      type: "website",
      url: path,
      siteName: "TeacherAid",
      title: t.meta.title,
      description: t.meta.description,
      locale: t.lang === "mk" ? "mk_MK" : "en_US",
    },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description },
    appleWebApp: { capable: true, title: "TeacherAid", statusBarStyle: "black-translucent" },
  };
}

export const siteViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1b3f",
  colorScheme: "dark",
};

// Adds `motion` before first paint so entrance states never flash; if the motion layer has
// not arrived after a few seconds, the page shows everything as it is.
const motionGuard = `(function(){try{var d=document.documentElement;if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('motion');setTimeout(function(){if(!window.__taMotion)d.classList.remove('motion')},3500)}}catch(e){}})();`;

export function SiteDocument({ lang, children }: { lang: "mk" | "en"; children: React.ReactNode }) {
  return (
    <html lang={lang} className={golos.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: motionGuard }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
