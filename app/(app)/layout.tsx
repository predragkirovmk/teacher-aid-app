import type { Metadata, Viewport } from "next";
import { Golos_Text } from "next/font/google";
import "./app.css";
import "./quiz.css";

const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TeacherAid",
  description: "TeacherAid student app demo.",
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

export default function AppRootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="mk" className={golos.variable}>
      <body>{children}</body>
    </html>
  );
}
