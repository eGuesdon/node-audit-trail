import type { AuditClient } from "./client.js";
import { getContext, withChildSpan } from "./context.js";

type Redactor<T = unknown> = (value: T) => T;

type DetailsFn<A extends unknown[] = unknown[], R = unknown> = (
  args: A,
  result?: R,
) => Record<string, unknown>;

export type AuditOptions<A extends unknown[] = unknown[], R = unknown> = {
  action?: string;
  entity?: string;
  on?: "success" | "error" | "always";
  redactArgs?: Redactor<A>;
  redactResult?: Redactor<R>;
  details?: DetailsFn<A, R>;
};

export function Audit<
  This = unknown,
  A extends unknown[] = unknown[],
  R = unknown,
>(audit: AuditClient, opts: AuditOptions<A, R> = {}) {
  return function (
    originalMethod: (this: This, ...args: A) => Promise<R> | R,
    context: ClassMethodDecoratorContext<
      This,
      (this: This, ...args: A) => Promise<R> | R
    >,
  ) {
    const actionName = opts.action ?? String(context.name);
    const entityName = opts.entity ?? "Unknown";

    return async function (this: This, ...args: A): Promise<R> {
      return withChildSpan(String(context.name), async () => {
        const ctx = getContext();
        const trace = {
          ...(ctx?.traceId ? { traceId: ctx.traceId } : {}),
          ...(ctx?.spanId ? { spanId: ctx.spanId } : {}),
          ...(ctx?.parentSpanId ? { parentSpanId: ctx.parentSpanId } : {}),
        };

        const redactArgs = opts.redactArgs ?? ((x: A) => x);
        const redactResult = opts.redactResult ?? ((x: R) => x);
        const safeArgs = redactArgs(args);

        try {
          const result = await originalMethod.apply(this, args);
          const safeResult = redactResult(result as R);

          if (!opts.on || opts.on === "always" || opts.on === "success") {
            const extra = opts.details?.(args, result as R) ?? {};
            await audit.log({
              action: actionName,
              entity: entityName,
              ...(ctx?.user ? { user: ctx.user } : {}),
              ...(ctx?.traceId ? { requestId: ctx.traceId } : {}),
              outcome: "success",
              details: {
                method: String(context.name),
                args: safeArgs as unknown,
                result: safeResult as unknown,
                trace,
                ...extra,
              },
            });
          }
          return result as R;
        } catch (err) {
          if (!opts.on || opts.on === "always" || opts.on === "error") {
            const errorObj: { name: string; message: string; stack?: string } =
              err instanceof Error
                ? {
                    name: err.name ?? "Error",
                    message: err.message ?? String(err),
                    ...(err.stack ? { stack: err.stack } : {}),
                  }
                : { name: "Error", message: String(err) };

            const extra = opts.details?.(args) ?? {};
            await audit
              .log({
                action: actionName,
                entity: entityName,
                ...(ctx?.user ? { user: ctx.user } : {}),
                ...(ctx?.traceId ? { requestId: ctx.traceId } : {}),
                outcome: "error",
                error: errorObj,
                details: {
                  method: String(context.name),
                  args: safeArgs as unknown,
                  trace,
                  ...extra,
                },
              })
              .catch(() => {});
          }
          throw err;
        }
      });
    };
  };
}
