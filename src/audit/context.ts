import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

import type { AuditUser } from "./types.js";

export type RequestContext = {
  traceId: string;
  user?: AuditUser | null;
  spanId?: string;
  parentSpanId?: string;
};

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T> | T,
) {
  return als.run(ctx, fn);
}
export function getContext(): RequestContext | undefined {
  return als.getStore();
}

function newId() {
  return crypto.randomUUID();
}

/** Exécute fn dans un sous-contexte (span enfant) sans jamais poser de `undefined` */
export async function withChildSpan<T>(
  _name: string,
  fn: () => Promise<T> | T,
) {
  const parent = getContext();
  const child: RequestContext = {
    traceId: parent?.traceId ?? newId(),
    spanId: newId(),
    ...(parent?.user !== undefined ? { user: parent.user } : {}),
    ...(parent?.spanId !== undefined ? { parentSpanId: parent.spanId } : {}),
  };
  return runWithContext(child, fn);
}
