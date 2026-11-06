import { siteUrl } from "@/lib/site-v2/url";
import { pageSchema, serializeSchema, type PageSchemaInput } from "@/lib/site-v2/schema";

/** The page's Schema.org graph, server-rendered. JSON-LD is data, so the CSP does not apply. */
export function JsonLd(props: Omit<PageSchemaInput, "origin">) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeSchema(pageSchema({ origin: siteUrl, ...props })) }} />
  );
}
