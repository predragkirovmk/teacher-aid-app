import { HostScreen } from "@/components/HostScreen";
import { HOST_KEY } from "@/lib/api";
import { content } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function HostPage(props: PageProps<"/host">) {
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const code = (one(sp.code) ?? content.code).toUpperCase();
  // The key only ever travels server → this page → the API; it is never rendered.
  const key = one(sp.key) ?? HOST_KEY;
  return (
    <HostScreen
      code={code}
      hostKey={key}
      initialSim={one(sp.sim) === "1"}
      resetOnLoad={one(sp.reset) === "1"}
      motion={one(sp.motion) !== "0"}
    />
  );
}
