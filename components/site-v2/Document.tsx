import type { Metadata, Viewport } from "next";
import { Geologica, Golos_Text } from "next/font/google";
import { pagePaths, type ArticleDict } from "@/content/site-v2/pages";
import type { SiteV2Dict } from "@/content/site-v2/types";
import { siteUrl } from "@/lib/site-v2/url";
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

export { siteUrl };

export function siteV2Metadata(t: SiteV2Dict): Metadata {
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

/*
  The share image for the reading pages. A page that sets its own openGraph replaces the layout's
  whole openGraph, image included, so the reading pages name theirs: the same picture as the
  home page of their language (app/(mk)/opengraph-image.jpg, app/(en)/en/opengraph-image.jpg).
*/
const shareImage: Record<ArticleDict["lang"], { url: string; alt: string }> = {
  mk: { url: "/og/teacheraid-mk.jpg", alt: "TeacherAid: „Целиот клас одговара.“ над лаптоп со апликацијата за наставникот." },
  en: { url: "/og/teacheraid-en.jpg", alt: 'TeacherAid: "The whole class answers." over a laptop with the teacher app.' },
};

/** A reading page's metadata: its own title, description, canonical and language pair. */
export function articleMetadata(page: ArticleDict): Metadata {
  const path = pagePaths[page.key][page.lang];
  const title = page.meta.title;
  const image = { ...shareImage[page.lang], width: 1200, height: 630, type: "image/jpeg" };
  return {
    title,
    description: page.meta.description,
    alternates: {
      canonical: path,
      languages: { mk: pagePaths[page.key].mk, en: pagePaths[page.key].en, "x-default": pagePaths[page.key].mk },
    },
    openGraph: {
      type: "website",
      url: path,
      siteName: "TeacherAid",
      title,
      description: page.meta.description,
      locale: page.lang === "mk" ? "mk_MK" : "en_US",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description: page.meta.description, images: [image] },
  };
}
