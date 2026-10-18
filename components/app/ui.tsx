"use client";

import { createContext, useContext } from "react";

export type ConfirmOptions = { title: string; confirmLabel: string; onConfirm: () => void };

type UI = {
  openLang: () => void;
  confirm: (options: ConfirmOptions) => void;
  toast: (message: string) => void;
  /** How to add the app to the Home Screen, for a browser that cannot show its own dialog. */
  openInstall: (how: "ios" | "manual") => void;
  /** The demo-time choices, from Home's demo label. */
  openClock: () => void;
};

export const UIContext = createContext<UI>({ openLang() {}, confirm() {}, toast() {}, openInstall() {}, openClock() {} });
export const useUI = () => useContext(UIContext);
