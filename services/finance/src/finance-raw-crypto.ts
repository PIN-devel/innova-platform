import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Version is embedded in the envelope. A missing key fails closed; never use JWT secrets.
export function createRawCipher(encoded = process.env.FINANCE_RAW_ENCRYPTION_KEY) {
  if (!encoded || !/^[a-f0-9]{64}$/i.test(encoded)) throw new Error("Raw encryption key unavailable");
  const key = Buffer.from(encoded, "hex");
  return {
    seal(value: unknown, aad: string) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(aad));
      const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
      return ["1", nonce.toString("hex"), cipher.getAuthTag().toString("hex"), body.toString("base64")].join(":");
    },
    open(value: string, aad: string): unknown {
      const [version, nonce, tag, body] = value.split(":");
      if (version !== "1" || !nonce || !tag || body === undefined) throw new Error("Invalid Raw envelope");
      const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "hex"));
      cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(Buffer.from(tag, "hex"));
      return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body, "base64")), cipher.final()]).toString("utf8"));
    },
  };
}
export type RawCipher = ReturnType<typeof createRawCipher>;
