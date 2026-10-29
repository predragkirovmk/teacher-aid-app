import { getTeacherState, subscribeTeacher } from "../store";
import type { DemoControls, TeacherApi } from "./client";
import { createMockApi, memorySource, type MockSource } from "./mock";
import { finishSignIn, MOCK_SESSION_KEY, readSession, writeSession, type DemoAccount } from "./mock-session";
import { freshState, MOCK_KEY, readState, startOfDay, writeState, type MockState, type Persona } from "./mock-state";

/**
 * The mock's own seams to the browser: the saved state in localStorage, and the demo school the teacher
 * has chosen in Settings. Kept apart from the adapter so the adapter can be tested with no browser.
 */

/** The day the server renders the demo as of. Only what does not depend on the date is rendered on the server (see hooks). */
export const SERVER_ANCHOR = new Date(2026, 9, 28).getTime();
/** The moment the server renders it at, fixed like the day, so the render that hydrates it reads the same clock. */
const SERVER_NOW = SERVER_ANCHOR + 9 * 3_600_000;

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

function browserSource(): MockSource & { reset(): void } {
  let state: MockState | null = null;
  // Read from the key on every call: the sign-in of the demo's provider page is a full page load that writes it, and another
  // window may write it too. The listeners are told when another window does.
  const session = (): Persona | null => readSession(storage());
  let lastType = getTeacherState().schoolType;
  const listeners = new Set<() => void>();
  let watching = false;
  const notify = () => listeners.forEach((l) => l());

  const load = (): MockState => {
    if (state) return state;
    const store = storage();
    state = readState(store, Date.now());
    // Saved straight away, so a first visit, or a save that could not be read, keeps the day it starts on and the demo's
    // history does not slide from one day to the next. A good save is written back with anything damaged left out.
    writeState(store, state);
    return state;
  };

  return {
    state: load,
    commit: (next) => {
      state = next;
      writeState(storage(), next);
    },
    schoolType: () => getTeacherState().schoolType,
    session,
    setSession: (next) => {
      writeSession(storage(), next);
      notify();
    },
    now: Date.now,
    subscribe: (listener) => {
      if (!watching) {
        watching = true;
        // Another window may change the demo's data (or clear it) while this one is open.
        window.addEventListener("storage", (e) => {
          // The session key too: signing out in another window ends this one's session as well, as a cookie would.
          if (e.key !== MOCK_KEY && e.key !== MOCK_SESSION_KEY && e.key !== null) return;
          state = null;
          notify();
        });
        // The demo switch in Settings picks the other school.
        subscribeTeacher(() => {
          const type = getTeacherState().schoolType;
          if (type === lastType) return;
          lastType = type;
          notify();
        });
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset: () => {
      state = freshState(startOfDay(Date.now()));
      writeState(storage(), state);
      notify();
    },
  };
}

/** The adapter the browser runs, and the demo's own controls. */
export function createBrowserMock(): { api: TeacherApi; demo: DemoControls } {
  const source = browserSource();
  return { api: createMockApi(source), demo: { reset: source.reset } };
}

/**
 * The adapter the server render reads: a fresh demo school as of a fixed day, never saved, and nobody signed in. The server
 * cannot know who is signed in (the browser's session is not sent to it), so what the server draws, and the render that
 * hydrates it, is the waiting screen of a page that needs a teacher, and nothing protected is ever in the markup.
 */
export function createServerMock(): TeacherApi {
  return createMockApi(memorySource(freshState(SERVER_ANCHOR), { now: () => SERVER_NOW, persona: null }));
}

/**
 * The demo's provider page returning, as `GET /auth/callback/{provider}` does: signs the chosen account in, if it is on the
 * list, and gives the path the browser goes to next. The caller loads that path as a new page, so the whole app starts again
 * knowing the session, as it does when the real callback redirects back.
 */
export function completeDemoSignIn(account: Exclude<DemoAccount, "offline">, returnTo: string): string {
  const { persona, location } = finishSignIn(account, returnTo, getTeacherState().schoolType);
  if (persona) writeSession(storage(), persona);
  return location;
}
