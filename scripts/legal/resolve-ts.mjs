/*
  Lets Node run the legal scripts against the website's own TypeScript files. Those files import each other without an
  extension ("./terms"), as Next expects; Node needs the real file name. This hook adds ".ts" to a relative import that
  has no extension, and changes nothing else. Used as: node --experimental-strip-types --import ./scripts/legal/resolve-ts.mjs
*/
import { register } from "node:module";

if (!globalThis.__teacheraidResolveTs) {
  globalThis.__teacheraidResolveTs = true;
  register(new URL(import.meta.url));
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      // Not a TypeScript file next to it: let Node resolve it as usual.
    }
  }
  return next(specifier, context);
}
