import type { Metadata, Viewport } from "next";
import { Golos_Text } from "next/font/google";
import { ServiceWorker } from "@/components/app/ServiceWorker";
import "./app.css";
import "./quiz.css";

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TeacherAid",
  description: "Скенирај го кодот на часот, пријави се и играј го квизот во живо.",
  applicationName: "TeacherAid",
  manifest: "/app.webmanifest",
  appleWebApp: { capable: true, title: "TeacherAid", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a5dae",
  colorScheme: "dark",
};

/** Before the first paint: skip the Home intro if it already played this session (see app/page). */
const RISE_SEEN = `try{if(sessionStorage.getItem("teacheraid-home-rise")==="1")document.documentElement.setAttribute("data-rise-seen","")}catch(e){}`;

export default function AppRootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script may add data-rise-seen to <html> before React hydrates it.
    <html lang="mk" className={golos.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: RISE_SEEN }} />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
