import { notFound } from "next/navigation";

/** Any unknown /app path: routes it to the app's own not-found page instead of the website's. */
export default function Unknown() {
  notFound();
}
