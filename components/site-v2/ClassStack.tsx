import { CLASS_SIZE } from "@/lib/site-v2/classroom";

/*
  The rest of the class for the hero's pinned scene: 28 phones stacked behind the one in front,
  like cards in a wallet. Each is a little narrower and paler than the one before it, so only its
  top edge shows; that edge turns yellow when its student answers. The front place is empty here:
  the hero's own phone flies into it. Shown only while the motion layer runs (see .hero__end).
*/
export function ClassStack({ label }: { label: string }) {
  const behind = Array.from({ length: CLASS_SIZE - 1 }, (_, i) => i + 1);
  return (
    <div className="stack" role="img" aria-label={label} data-stack>
      {behind.map((k) => (
        <span className="stack__card" key={k} data-card style={{ "--k": k, zIndex: CLASS_SIZE - k } as React.CSSProperties}>
          <b data-lit />
        </span>
      ))}
      <span className="stack__front" data-stack-front />
    </div>
  );
}
