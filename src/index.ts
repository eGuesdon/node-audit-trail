import { AuditClient } from "./audit/client.js";
import { FileJsonlSink } from "./audit/fileSink.js";
import { Audit } from "./audit/decorators.js";
import { getLastHmacFromFile } from "./audit/chainStore.js";

const auditKey = process.env.AUDIT_KEY ?? "dev-secret-change-me";
const sink = new FileJsonlSink("./audit.log");
const last = await getLastHmacFromFile("./audit.log");
const audit = new AuditClient({
  signingKey: auditKey,
  keyId: "k1",
  chain: true,
  ...(last ? { seedPrevHmac: last } : {}),
  sink,
});

class ProjectService {
  constructor(private a: AuditClient) {}

  @Audit(audit, {
    action: "createProject",
    entity: "Project",
    redactArgs: (args) => ({ ...args[0], secret: "***" }),
  })
  async createProject(payload: { name: string; secret: string }) {
    // logique métier fictive
    if (!payload.name) throw new Error("NAME_REQUIRED");
    return {
      id: "P-" + Math.random().toString(36).slice(2),
      name: payload.name,
    };
  }
}

(async () => {
  const svc = new ProjectService(audit);
  await svc.createProject({ name: "WindFarm-EU", secret: "TOP-SECRET" });
  console.log("✅ Event audité → audit.log");
})();
