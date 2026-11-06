"use client";

import { useParams } from "next/navigation";
import { PracticePlayer } from "@/components/app/practice/Player";

/** One practice set: where a notice, Home or a subject leads. */
export default function PracticeSetPage() {
  const { id } = useParams<{ id: string }>();
  return <PracticePlayer id={decodeURIComponent(id)} />;
}
