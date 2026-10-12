"use client";

import {
  Bell,
  Check,
  Ellipsis,
  FileText,
  House,
  LogOut,
  QrCode,
  Settings,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNotifs } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { actions, useApp } from "@/lib/app/store";
import type { Locale } from "@/lib/app/data";
import { UIContext } from "./ui";

const NO_TABS = ["/app/scan", "/app/welcome"];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signedIn, locale } = useApp();
  // Remember the path an overlay was opened on, so navigating closes it without an effect.
  const [drawerAt, setDrawerAt] = useState<string | null>(null);
  const [langAt, setLangAt] = useState<string | null>(null);
  const drawer = drawerAt === pathname;
  const lang = langAt === pathname;
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);

  const ui = useMemo(
    () => ({ openDrawer: () => setDrawerAt(pathname), openLang: () => setLangAt(pathname), toast }),
    [toast, pathname],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!signedIn && pathname !== "/app/welcome") router.replace("/app/welcome");
  }, [signedIn, pathname, router]);

  const showTabs = !NO_TABS.includes(pathname);

  return (
    <UIContext.Provider value={ui}>
      <div className="stage">
        <div className="phone">
          {children}
          {showTabs && <TabBar pathname={pathname} onMore={() => setDrawerAt(pathname)} />}
          {drawer && <Drawer onClose={() => setDrawerAt(null)} />}
          {lang && <LangSheet onClose={() => setLangAt(null)} />}
          {toastMsg && (
            <div className="toast glass" role="status">
              {toastMsg}
            </div>
          )}
        </div>
      </div>
    </UIContext.Provider>
  );
}

function TabBar({ pathname, onMore }: { pathname: string; onMore: () => void }) {
  const { t } = useT();
  const unread = useNotifs().filter((n) => n.unread).length;

  const link = (href: string, label: string, Icon: LucideIcon, active: boolean, badge = 0) => (
    <Link href={href} className="tab" aria-current={active ? "page" : undefined}>
      <Icon size={24} strokeWidth={2} />
      {label}
      {badge > 0 && (
        <span className="tab__badge" aria-label={`${badge}`}>
          {badge}
        </span>
      )}
    </Link>
  );

  return (
    <nav className="tabbar glass" aria-label="Main">
      {link("/app", t("nav.home"), House, pathname === "/app")}
      {link("/app/notifications", t("nav.alerts"), Bell, pathname.startsWith("/app/notifications"), unread)}
      <Link href="/app/scan" className="tab tab--scan" aria-label={t("nav.scan")}>
        <span className="fab">
          <QrCode size={30} strokeWidth={2} />
        </span>
      </Link>
      {link("/app/profile", t("nav.profile"), User, pathname === "/app/profile")}
      <button className="tab" onClick={onMore} aria-haspopup="dialog">
        <Ellipsis size={24} strokeWidth={2} />
        {t("nav.more")}
      </button>
    </nav>
  );
}

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, a")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [onClose]);
  return ref;
}

function Drawer({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const ref = useDialog(onClose);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const items: [string, string, LucideIcon][] = [
    ["/app/settings", t("drawer.settings"), Settings],
    ["/app/documents", t("drawer.documents"), FileText],
    ["/app/achievements", t("drawer.achievements"), Trophy],
  ];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer glass" role="dialog" aria-modal="true" aria-label={t("nav.more")} ref={ref}>
        <div className="drawer__who">
          <span className="avatar">МТ</span>
          <div>
            <div className="t-label" style={{ fontSize: 17 }}>
              {t("user.name")}
            </div>
            <div className="t-cap">{t("user.role")}</div>
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {items.map(([href, label, Icon]) => (
            <button key={href} className="navitem" onClick={() => go(href)}>
              <span className="navitem__icon">
                <Icon size={22} strokeWidth={2} />
              </span>
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: "auto" }}>
          <button
            className="navitem"
            onClick={() => {
              onClose();
              actions.setSignedIn(false);
              router.push("/app/welcome");
            }}
          >
            <span className="navitem__icon">
              <LogOut size={22} strokeWidth={2} />
            </span>
            {t("drawer.logout")}
          </button>
        </div>
      </div>
    </>
  );
}

function LangSheet({ onClose }: { onClose: () => void }) {
  const { t, locale } = useT();
  const ref = useDialog(onClose);
  const opts: { id: Locale; label: string; code: string }[] = [
    { id: "en", label: "English", code: "EN" },
    { id: "mk", label: "Македонски", code: "МК" },
  ];
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet glass" role="dialog" aria-modal="true" aria-label={t("lang.title")} ref={ref}>
        <div className="sheet__grip" />
        <div role="radiogroup" aria-label={t("lang.title")}>
          {opts.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={locale === o.id}
              className="opt"
              onClick={() => {
                actions.setLocale(o.id);
                onClose();
              }}
            >
              <span>
                {o.label}
                <small>{o.code}</small>
              </span>
              {locale === o.id && (
                <span className="check">
                  <Check size={22} strokeWidth={2.5} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
