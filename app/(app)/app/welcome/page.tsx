"use client";

import { useRouter } from "next/navigation";
import { Mark } from "@/components/app/Mark";
import { useT } from "@/lib/app/i18n";
import { actions } from "@/lib/app/store";

export default function Welcome() {
  const { t } = useT();
  const router = useRouter();
  return (
    <main className="screen screen--bare">
      <div className="welcome">
        <Mark size={96} />
        <span className="brand__name" style={{ fontSize: 20 }}>
          Teacher Aid
        </span>
        <h1 className="t-display" style={{ fontSize: 28, marginTop: 24 }}>
          {t("welcome.title")}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {t("welcome.sub")}
        </p>
        <button
          className="btn btn--primary btn--block"
          style={{ marginTop: 28 }}
          onClick={() => {
            actions.setSignedIn(true);
            router.push("/app");
          }}
        >
          {t("welcome.cta")}
        </button>
        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          <button className="pill" onClick={() => actions.setLocale("mk")}>
            МК
          </button>
          <button className="pill" onClick={() => actions.setLocale("en")}>
            EN
          </button>
        </div>
      </div>
    </main>
  );
}
