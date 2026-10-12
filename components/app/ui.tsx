"use client";

import { createContext, useContext } from "react";

type UI = {
  openDrawer: () => void;
  openLang: () => void;
  toast: (message: string) => void;
};

export const UIContext = createContext<UI>({ openDrawer() {}, openLang() {}, toast() {} });
export const useUI = () => useContext(UIContext);
