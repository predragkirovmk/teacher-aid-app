import { PrintSheet } from "@/components/PrintSheet";
import { content } from "@/lib/content";

export default function PrintPage() {
  return <PrintSheet code={content.code} />;
}
