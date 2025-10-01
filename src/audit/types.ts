export type AuditOutcome = "success" | "error";

export interface AuditUser {
  id: string;
  name?: string;
}

export interface AuditEvent {
  timestamp: string; // ISO
  user?: AuditUser | null;
  action: string; // ex: "createProject"
  entity?: string; // ex: "Project"
  details?: Record<string, unknown>;
  requestId?: string;
  outcome?: AuditOutcome;
  error?: { name: string; message: string; stack?: string };
  keyId?: string; // version de clé HMAC
  prevHmac?: string; // chaînage (tamper-evidence)
  hmac: string; // signature calculée
}
