import crypto from "node:crypto";

import { AuditClient } from "./audit/client.js";
import { FileJsonlSink } from "./audit/fileSink.js";
import { Audit } from "./audit/decorators.js";
import { runWithContext } from "./audit/context.js";

const auditKey = process.env.AUDIT_KEY ?? "dev-secret-change-me";
const sink = new FileJsonlSink("./audit.log");
const audit = new AuditClient({
  signingKey: auditKey,
  keyId: "k1",
  chain: true,
  sink,
});

class ProjectService {
  constructor(private a: AuditClient) {}

  @Audit(audit, {
    action: "createProject",
    entity: "Project",
    redactArgs: (args) => [{ ...args[0], secret: "***" }],
  })
  async createProject(payload: { name: string; secret: string }) {
    // appelle une autre méthode décorée pour démontrer le chainage span/parentSpan
    await this.computeBudget({ project: payload.name, amount: 42 });
    return {
      id: "P-" + Math.random().toString(36).slice(2),
      name: payload.name,
    };
  }

  @Audit(audit, { action: "computeBudget", entity: "Project" })
  async computeBudget(input: { project: string; amount: number }) {
    return { project: input.project, budget: input.amount * 1000 };
  }
}

(async () => {
  const svc = new ProjectService(audit);

  // ✅ point d’entrée “utilisateur” : on crée un contexte
  await runWithContext(
    { traceId: crypto.randomUUID(), user: { id: "u-123", name: "Eric" } },
    async () => {
      await svc.createProject({ name: "WindFarm-EU", secret: "TOP-SECRET" });
    },
  );

  console.log("✅ ALS context used — check audit.log for trace/span chain");
})();
