"use client";

import { createContext, useContext } from "react";

export type ConfirmOptions = { title: string; confirmLabel: string; onConfirm: () => void; /** What the choice means, under the question. */ body?: string };

type UI = {
  openLang: () => void;
  confirm: (options: ConfirmOptions) => void;
  toast: (message: string) => void;
  /** How to add the app to the Home Screen, for a browser that cannot show its own dialog; `push` says why, when it is for notifications. */
  openInstall: (how: "ios" | "manual", reason?: "push") => void;
  /** How to allow notifications again in the phone's own settings, once the browser has blocked them. */
  openPushHelp: () => void;
  /** The demo-time choices, from Home's demo label. */
  openClock: () => void;
  /** The in-app Back: slides the screen away, or goes Home when there is no history. It lives in the Shell so its code ships once, not in every screen's chunk. */
  back: () => void;
};

export const UIContext = createContext<UI>({ openLang() {}, confirm() {}, toast() {}, openInstall() {}, openPushHelp() {}, openClock() {}, back() {} });
export const useUI = () => useContext(UIContext);

/** True while a tap on a tab is going somewhere (Shell). Things that must not animate on a tab switch ask it, not the transition type, which React can lose under load. */
export const TabTapContext = createContext(false);
