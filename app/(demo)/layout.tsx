import type { Metadata, Viewport } from "next";
import { Bitter, Sofia_Sans } from "next/font/google";
import { content } from "@/lib/content";
import "./globals.css";

const bitter = Bitter({
  variable: "--font-bitter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const sofia = Sofia_Sans({
  variable: "--font-sofia",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: content.app,
  description: "Every class starts with a question.",
  applicationName: content.app,
  appleWebApp: { capable: true, title: content.app, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2b544",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bitter.variable} ${sofia.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
