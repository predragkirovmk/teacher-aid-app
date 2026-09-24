import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TeacherAid",
    short_name: "TeacherAid",
    description: "Секој час почнува со прашање.",
    lang: "mk",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b1b3f",
    theme_color: "#0b1b3f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/site/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/site/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/site/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
