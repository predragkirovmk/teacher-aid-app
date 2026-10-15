/** The build this deployment serves, so an open copy of the student app can tell it is out of date. */
export const dynamic = "force-static";

export function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_APP_BUILD });
}
