"use client";

import { createContext, useContext } from "react";

export type ConfirmOptions = { title: string; confirmLabel: string; onConfirm: () => void };

type UI = {
  openLang: () => void;
  confirm: (options: ConfirmOptions) => void;
  toast: (message: string) => void;
};

export const UIContext = createContext<UI>({ openLang() {}, confirm() {}, toast() {} });
export const useUI = () => useContext(UIContext);
