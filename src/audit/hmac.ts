import crypto from "node:crypto";

import { stableStringify } from "./stableStringify.js";

export function computeHmac(secret: string, payload: unknown): string {
  const data = stableStringify(payload);
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}
