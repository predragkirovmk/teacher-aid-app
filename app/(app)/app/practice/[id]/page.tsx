"use client";

import { useParams } from "next/navigation";
import { PracticePlayer } from "@/components/app/practice/Player";

/** One practice set: where an alert or Home leads. */
export default function PracticeSetPage() {
  const { id } = useParams<{ id: string }>();
  return <PracticePlayer id={decodeURIComponent(id)} />;
}
