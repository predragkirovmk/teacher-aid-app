import { ArticlePage } from "@/components/site-v2/ArticlePage";
import { articleMetadata } from "@/components/site-v2/Document";
import { en } from "@/content/site-v2/en";
import { pages } from "@/content/site-v2/pages";

const page = pages.quiz.en;

export const metadata = articleMetadata(page);

export default function QuizEn() {
  return <ArticlePage t={en} page={page} />;
}
