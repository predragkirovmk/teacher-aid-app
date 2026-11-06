// The main domain; previews and local builds point at themselves.
export const siteUrl =
  process.env.VERCEL_ENV === "production"
    ? "https://teacheraid.education"
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
