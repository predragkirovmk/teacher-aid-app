import { exportKeyMatches, listSignups } from "@/lib/early-access";

export const dynamic = "force-dynamic";

// Quotes every cell, and defuses anything a spreadsheet would run as a formula.
function cell(value: string | null): string {
  const text = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** GET /api/early-access/export, with the key as `Authorization: Bearer <key>` or `?key=<key>`. */
export async function GET(req: Request) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const key = bearer || new URL(req.url).searchParams.get("key");
  if (!exportKeyMatches(key)) {
    return new Response("Unauthorized\n", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const rows = await listSignups();
  const csv = [
    "email,signed_up_at,src",
    ...rows.map((row) => [row.email, row.at, row.src].map(cell).join(",")),
  ].join("\r\n");

  const day = new Date().toISOString().slice(0, 10);
  return new Response(`${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="teacheraid-early-access-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
