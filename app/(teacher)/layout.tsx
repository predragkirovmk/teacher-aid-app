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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#124554",
  colorScheme: "dark",
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
