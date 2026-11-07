import { notFound } from "next/navigation";

/** Any unknown /teacher path: routes it to the teacher app's own not-found page instead of the website's. */
export default function Unknown() {
  notFound();
}
