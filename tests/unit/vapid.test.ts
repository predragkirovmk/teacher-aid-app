import { createECDH } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { urlBase64ToBytes } from "@/lib/app/push/flow";

/** The key pair the fake API stands for (tests/fake-api/make-vapid.mts): a real P-256 pair, and the only one in the repo. */
const keys = JSON.parse(readFileSync(new URL("../fake-api/vapid.json", import.meta.url), "utf8")) as { publicKey: string; privateKey: string };

describe("the fake API's VAPID key pair", () => {
  it("is an uncompressed P-256 point and the private key that makes it", () => {
    const publicKey = urlBase64ToBytes(keys.publicKey);
    expect(publicKey).toHaveLength(65);
    expect(publicKey[0]).toBe(4);
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(keys.privateKey, "base64url"));
    expect(ecdh.getPublicKey().toString("base64url")).toBe(keys.publicKey);
  });
});
