import type { Metadata, Viewport } from "next";
import { Golos_Text } from "next/font/google";
import type { ReactNode } from "react";
import { Gate } from "@/components/teacher/Gate";
import { ServiceWorker } from "@/components/teacher/ServiceWorker";
import "./teacher.css";

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  description: "Подгответе ја лекцијата, одржете ја во живо и погледнете ги резултатите.",
  applicationName: "TeacherAid",
  manifest: "/teacher.webmanifest",
  icons: {
    icon: [{ url: "/teacher-icons/icon.svg", type: "image/svg+xml" }],
    apple: "/teacher-icons/apple-icon.png",
  },
  robots: { index: false, follow: false },
};

// The window's own colour is the ground of the app, so the browser's bar and the page read as one light surface. The projected
// window is the one dark page and says so itself (teacher/live/[sessionId]/class/page.tsx).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eef2f2",
  colorScheme: "light",
};

export default function TeacherRootLayout({ children }: { children: ReactNode }) {
  return (
    // The store (lib/teacher/store.ts) sets lang to the teacher's choice once the page is live.
    <html lang="mk" className={golos.variable} suppressHydrationWarning>
      <body>
        <ServiceWorker />
        <Gate>{children}</Gate>
      </body>
    </html>
  );
}
