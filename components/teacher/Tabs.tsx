"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type TabItem<T extends string> = { id: T; label: ReactNode };

/**
 * A row of tabs over panels of which one is shown. The row is one stop for the keyboard: the arrows, Home and End move between the tabs and
 * show the panel at once, and Tab goes on into the panel. The chosen tab is told apart by its own ground, an edge and heavier words, never
 * by colour alone. What a tab must say without being opened (a count) is part of its label.
 */
export function Tabs<T extends string>({
  name,
  label,
  tabs,
  value,
  onChange,
}: {
  name: string;
  label: string;
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((tab) => tab.id === value);
    const to =
      e.key === "ArrowRight"
        ? (at + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (at - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus();
  };
  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      className="tabs"
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`${name}-tab-${tab.id}`}
          className="tabs__tab"
          aria-selected={tab.id === value}
          aria-controls={`${name}-panel-${tab.id}`}
          tabIndex={tab.id === value ? 0 : -1}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * One panel of a row of tabs. A panel that is not shown stays in the page with its contents hidden by the style sheet, so what it holds
 * keeps its state, and a line it reads out (a new anonymous question) is still read out. `tabbed` is false where the same panel stands
 * alone, with no row of tabs over it.
 */
export function TabPanel({
  name,
  id,
  active,
  tabbed = true,
  children,
}: {
  name: string;
  id: string;
  active: boolean;
  tabbed?: boolean;
  children: ReactNode;
}) {
  const shown = active && tabbed;
  return (
    <div
      id={`${name}-panel-${id}`}
      className="tabs__panel"
      role={shown ? "tabpanel" : undefined}
      aria-labelledby={shown ? `${name}-tab-${id}` : undefined}
      data-active={active}
    >
      {children}
    </div>
  );
}
