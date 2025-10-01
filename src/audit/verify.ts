import { readFile } from "node:fs/promises";

import { computeHmac } from "./hmac.js";
import type { AuditEvent } from "./types.js";

const file = process.argv[2] ?? "audit.log";
const secret = process.env.AUDIT_KEY ?? "dev-secret-change-me";

function base(e: AuditEvent) {
  const raw = {
    timestamp: e.timestamp,
    user: e.user,
    action: e.action,
    entity: e.entity,
    details: e.details,
    requestId: e.requestId,
    outcome: e.outcome,
    error: e.error,
    keyId: e.keyId,
    prevHmac: e.prevHmac,
  };
  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined),
  );
}

(async () => {
  const raw = await readFile(file, "utf8").catch(() => "");
  const lines = raw.split("\n").filter(Boolean);
  let ok = 0,
    bad = 0,
    chainBreaks = 0;
  let prev: AuditEvent | undefined;

  for (let i = 0; i < lines.length; i++) {
    const e = JSON.parse(lines[i]!) as AuditEvent;
    const expected = computeHmac(secret, base(e));
    if (expected === e.hmac) ok++;
    else bad++;

    if (typeof e.prevHmac !== "undefined") {
      const should = prev?.hmac;
      if (should !== e.prevHmac) chainBreaks++;
    }
    prev = e;
  }

  console.log(`File: ${file}`);
  console.log(
    `Events: ${lines.length} | HMAC OK: ${ok} | HMAC BAD: ${bad} | Chain breaks: ${chainBreaks}`,
  );
  if (bad > 0) process.exit(2);
  if (chainBreaks > 0) process.exit(3);
})();
