import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const VERSION = "v1";

function getKey(): Buffer {
  const hex = process.env.MP_TOKEN_ENC_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("MP_TOKEN_ENC_KEY must be 32 bytes of hex (64 hex chars)");
  }
  return Buffer.from(hex, "hex");
}

/** AES-256-GCM. Output: `v1:<iv_hex>:<tag_hex>:<ciphertext_hex>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("hex"), tag.toString("hex"), ct.toString("hex")].join(":");
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed secret envelope");
  }
  const [version, ivHex, tagHex, ctHex] = parts;
  if (
    version !== VERSION ||
    ivHex.length !== 24 ||  // 12-byte IV
    tagHex.length !== 32 || // 16-byte tag
    !ctHex
  ) {
    throw new Error("Malformed secret envelope");
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
