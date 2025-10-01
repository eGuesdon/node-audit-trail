import { describe, it, expect } from "vitest";

import { AuditClient } from "./client.js";
import { computeHmac } from "./hmac.js";
import type { AuditEvent } from "./types.js";

class MemSink {
  public events: AuditEvent[] = [];
  async write(e: AuditEvent) {
    this.events.push(e);
  }
}

describe("AuditClient", () => {
  it("signs events and chains prevHmac", async () => {
    const sink = new MemSink();
    const audit = new AuditClient({
      signingKey: "k",
      keyId: "kid",
      chain: true,
      sink,
    });

    const e1 = await audit.log({
      action: "A1",
      entity: "E",
      details: { n: 1 },
    });
    const e2 = await audit.log({
      action: "A2",
      entity: "E",
      details: { n: 2 },
    });

    const base = (e: AuditEvent) => {
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
    };

    expect(e1.prevHmac).toBeUndefined();
    expect(e2.prevHmac).toBe(e1.hmac);
    expect(e1.hmac).toBe(computeHmac("k", base(e1)));
    expect(e2.hmac).toBe(computeHmac("k", base(e2)));
    expect(sink.events).toHaveLength(2);
  });
});
