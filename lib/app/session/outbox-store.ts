/**
 * What the answer outbox keeps on the phone, behind a three-method interface so the outbox itself
 * can be tested on a plain Map. The real one is IndexedDB, a few dozen lines of it instead of a
 * dependency; where IndexedDB is missing or refuses (a private window, blocked site data, a full
 * disk) it falls back to memory, so answers are still retried for as long as the page lives.
 */

import type { SubmissionKind } from "../api/types";

/** localStorage: who was signed in last, so a phone that cannot reach the server can still say whose answers it holds. Cleared when the session ends. */
export const OUTBOX_STUDENT_KEY = "teacheraid-outbox-student";

/** One answer, practice answer or question to the teacher waiting to reach the server. */
export type OutboxRecord = {
  /** Which endpoint it goes to: `/answers`, a practice set's `/answers` or `/anon-questions`. For a question to the teacher `response` is the text (and it has no `sessionQuestionId`). */
  kind: SubmissionKind;
  /** The idempotency key: the server stores one answer per key, so a resend is safe (EC-NET-06). */
  key: string;
  /** Whose answer it is. Answers of a student who signed out are kept, and sent when they sign in again. */
  studentId: string;
  sessionId: string;
  sessionQuestionId: string;
  response: string;
  /** When the student answered, in server-clock terms from the engine's offset; never the phone's clock (EC-NET-07). */
  answeredAt: number;
  /** The phone's time when it was saved, used only to drop what is too old to matter. */
  savedAt: number;
};

export interface OutboxStore {
  all(): Promise<OutboxRecord[]>;
  put(record: OutboxRecord): Promise<void>;
  remove(key: string): Promise<void>;
}

export function memoryStore(): OutboxStore {
  const records = new Map<string, OutboxRecord>();
  return {
    all: async () => [...records.values()],
    put: async (r) => void records.set(r.key, r),
    remove: async (key) => void records.delete(key),
  };
}

const DB_NAME = "teacheraid-outbox";
const STORE = "answers";

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked"));
  });
}

/**
 * IndexedDB when the browser has it and lets the page use it. Every call that fails is repeated on a
 * memory copy, so the store never throws: an answer the disk would not take is still sent from memory.
 */
export function indexedDbStore(factory: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB): OutboxStore {
  const memory = memoryStore();
  let db: Promise<IDBDatabase | null> | null = null;
  const open = () => (db ??= factory ? openDb(factory).catch(() => null) : Promise.resolve(null));

  return {
    async all() {
      const handle = await open();
      const kept = await memory.all();
      if (!handle) return kept;
      try {
        const stored = await done(handle.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<OutboxRecord[]>);
        const byKey = new Map(stored.map((r) => [r.key, r]));
        for (const r of kept) byKey.set(r.key, r);
        return [...byKey.values()];
      } catch {
        return kept;
      }
    },
    async put(record) {
      const handle = await open();
      if (handle) {
        try {
          const tx = handle.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(record);
          await finished(tx);
          return;
        } catch {
          // fall through to memory
        }
      }
      await memory.put(record);
    },
    async remove(key) {
      await memory.remove(key);
      const handle = await open();
      if (!handle) return;
      try {
        const tx = handle.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        await finished(tx);
      } catch {
        // a record that could not be removed is dropped again next time it is read and refused as a duplicate
      }
    },
  };
}
