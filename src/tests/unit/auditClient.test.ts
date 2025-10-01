import { describe, it, expect } from "vitest";

import { AuditClient } from "../../audit/client.js";
import { computeHmac } from "../../audit/hmac.js";
import type { AuditEvent } from "../../audit/types.js";

class MemSink {
  public events: AuditEvent[] = [];
  async write(e: AuditEvent): Promise<void> {
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
      user: null,
      details: { n: 1 },
    });
    const e2 = await audit.log({
      action: "A2",
      entity: "E",
      user: null,
      details: { n: 2 },
    });

    expect(e1.user).toBeNull();
    expect(e2.user).toBeNull();

    const base = (e: AuditEvent): Record<string, unknown> => {
      const raw: Record<string, unknown> = {
        timestamp: e.timestamp,
        user: e.user, // always present (null for system)
        action: e.action,
        entity: e.entity,
        details: e.details,
        requestId: e.requestId,
        outcome: e.outcome,
        error: e.error,
        keyId: e.keyId,
        prevHmac: e.prevHmac,
      };
      // drop undefined to mimic canonicalization used by signer
      for (const k of Object.keys(raw)) {
        if (raw[k] === undefined) delete raw[k];
      }
      return raw;
    };

    expect(e1.prevHmac).toBeUndefined();
    expect(e2.prevHmac).toBe(e1.hmac);
    expect(e1.hmac).toBe(computeHmac("k", base(e1)));
    expect(e2.hmac).toBe(computeHmac("k", base(e2)));
    expect(sink.events).toHaveLength(2);
  });
  it("signs events with a human user and keeps user in the signed payload", async () => {
    const sink = new MemSink();
    const audit = new AuditClient({
      signingKey: "k",
      keyId: "kid",
      chain: false, // pas besoin de chaîne pour ce test
      sink,
    });

    const e = await audit.log({
      action: "A_HUMAN",
      entity: "E",
      user: { id: "alice", name: "Alice Doe" }, // ← utilisateur humain explicite
      details: { n: 42 },
    });

    // Le user doit être présent et exact
    expect(e.user).toStrictEqual({ id: "alice", name: "Alice Doe" });

    // Le HMAC doit correspondre au payload canonique
    const baseHuman = (ev: AuditEvent): Record<string, unknown> => {
      const raw: Record<string, unknown> = {
        timestamp: ev.timestamp,
        user: ev.user, // toujours présent (ici "alice")
        action: ev.action,
        entity: ev.entity,
        details: ev.details,
        requestId: ev.requestId,
        outcome: ev.outcome,
        error: ev.error,
        keyId: ev.keyId,
        prevHmac: ev.prevHmac,
      };
      for (const k of Object.keys(raw)) {
        if (raw[k] === undefined) delete raw[k];
      }
      return raw;
    };

    expect(e.hmac).toBe(computeHmac("k", baseHuman(e)));
  });

  it("detects tampering: changing details invalidates HMAC", async () => {
    const sink = new MemSink();
    const audit = new AuditClient({
      signingKey: "k",
      keyId: "kid",
      chain: false,
      sink,
    });

    const e = await audit.log({
      action: "A_TAMPER",
      entity: "E",
      user: null, // système
      details: { n: 1 },
    });

    // Base helper identique à la canonicalisation du test précédent
    const baseCanonical = (ev: AuditEvent): Record<string, unknown> => {
      const raw: Record<string, unknown> = {
        timestamp: ev.timestamp,
        user: ev.user,
        action: ev.action,
        entity: ev.entity,
        details: ev.details,
        requestId: ev.requestId,
        outcome: ev.outcome,
        error: ev.error,
        keyId: ev.keyId,
        prevHmac: ev.prevHmac,
      };
      for (const k of Object.keys(raw)) {
        if (raw[k] === undefined) delete raw[k];
      }
      return raw;
    };

    // On simule une altération du log (ex: détail modifié)
    const tampered = {
      ...baseCanonical(e),
      details: { n: 999 }, // ← corruption
    };

    // Le HMAC recalculé sur ce payload corrompu ne doit PAS
    // être égal au HMAC original signé par la lib
    const tamperedHmac = computeHmac("k", tampered);
    expect(tamperedHmac).not.toBe(e.hmac);
  });
});
