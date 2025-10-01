import { describe, it, expect } from "vitest";

import { AuditClient } from "../../audit/client.js";
import type { AuditEvent } from "../../audit/types.js";
import { runWithContext } from "../../audit/context.js";
import { Audit } from "../../audit/decorators.js";

class MemSink {
  public events: AuditEvent[] = [];
  async write(e: AuditEvent) {
    this.events.push(e);
  }
}

type Trace = { traceId?: string; spanId?: string; parentSpanId?: string };

function getTrace(details: AuditEvent["details"]): Trace | undefined {
  if (!details || typeof details !== "object") return undefined;
  const raw = (details as Record<string, unknown>)["trace"];
  if (!raw || typeof raw !== "object") return undefined;

  const obj = raw as Record<string, unknown>;
  const out: Trace = {}; // on ajoute les clés uniquement si définies

  if (typeof obj.traceId === "string") out.traceId = obj.traceId;
  if (typeof obj.spanId === "string") out.spanId = obj.spanId;
  if (typeof obj.parentSpanId === "string") out.parentSpanId = obj.parentSpanId;

  return out;
}

describe("ALS context propagation", () => {
  it("propagates traceId/user and chains span/parentSpan via decorator", async () => {
    const sink = new MemSink();
    const audit = new AuditClient({
      signingKey: "k",
      keyId: "kid",
      chain: true,
      sink,
    });

    class Svc {
      @Audit(audit, { action: "outer", entity: "Svc" })
      async outer() {
        return this.inner();
      }

      @Audit(audit, { action: "inner", entity: "Svc" })
      async inner() {
        return "ok";
      }
    }
    const svc = new Svc();

    const traceId = "trace-abc";
    await runWithContext(
      { traceId, user: { id: "u1", name: "Eric" } },
      async () => {
        await svc.outer();
      },
    );

    expect(sink.events.length).toBe(2);
    const eOuter = sink.events.find((e) => e.action === "outer") as AuditEvent;
    const eInner = sink.events.find((e) => e.action === "inner") as AuditEvent;

    expect(eOuter).toBeTruthy();
    expect(eInner).toBeTruthy();

    expect(eOuter.requestId).toBe(traceId);
    expect(eOuter.user?.id).toBe("u1");

    const tOuter = getTrace(eOuter.details)!;
    const tInner = getTrace(eInner.details)!;

    expect(tOuter.traceId).toBe(traceId);
    expect(tInner.traceId).toBe(traceId);
    expect(typeof tOuter.spanId).toBe("string");
    expect(tInner.parentSpanId).toBe(tOuter.spanId);
  });
});
