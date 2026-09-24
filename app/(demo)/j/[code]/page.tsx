import { PhoneScreen } from "@/components/PhoneScreen";

export default async function JoinPage(props: PageProps<"/j/[code]">) {
  const { code } = await props.params;
  return <PhoneScreen code={code.toUpperCase()} />;
}
