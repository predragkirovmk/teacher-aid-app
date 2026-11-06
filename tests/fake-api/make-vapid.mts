/**
 * Make the VAPID key pair the fake API stands for: `node tests/fake-api/make-vapid.mts`. The public key is what the live build
 * is given (NEXT_PUBLIC_VAPID_PUBLIC_KEY, playwright.config.ts) and what the browser subscribes with; the private key would sign
 * pushes. It is a throwaway for tests, kept in tests/ only, and a real key is made on the API server and never written in this repo.
 */
import { createECDH } from "node:crypto";
import { writeFileSync } from "node:fs";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const b64url = (b: Buffer) => b.toString("base64url");
const keys = { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
writeFileSync(new URL("./vapid.json", import.meta.url), `${JSON.stringify(keys, null, 2)}\n`);
console.log("wrote tests/fake-api/vapid.json");
