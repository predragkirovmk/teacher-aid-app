import type { Metadata, Viewport } from "next";
import { Golos_Text } from "next/font/google";
import "./early-access.css";

// Latin only: this page is English, so the Cyrillic files never download.
const golos = Golos_Text({
  variable: "--font-golos",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Early access | TeacherAid",
  description: "Get early access to TeacherAid.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1b3f",
  colorScheme: "dark",
};

export default function EarlyAccessLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={golos.variable}>
      <body>{children}</body>
    </html>
  );
}
