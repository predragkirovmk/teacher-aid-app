/**
 * localStorage keys that "Clear data on this phone" leaves alone (lib/app/phone-data.ts). The language is one. The demo's mock
 * adapter registers its own, which are its stand-in server and not data on the phone; registering them from the mock itself keeps
 * their names out of a live build.
 */
const kept = new Set<string>();

export const keepOnClear = (key: string) => {
  kept.add(key);
  return key;
};

export const keptOnClear = (): readonly string[] => [...kept];
