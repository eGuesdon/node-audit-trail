/**
 * Audit types — extensible contract with an immutable core.
 *
 * FR 🇫🇷 — Comment étendre le contrat ?
 *  - Le noyau immuable (`timestamp`, `action`, `hmac`) reste garanti par la lib.
 *  - Vous pouvez typer le contenu métier via le paramètre générique `D` de `AuditEvent`/`InputEvent`.
 *  - Recommandation : placez **toutes** vos données métier dans `details`.
 *  - Le HMAC signe aussi `details`, donc toute modification sera détectée.
 *  - Avec `exactOptionalPropertyTypes`, les champs `undefined` sont **omis** à l'écriture.
 *  - Le champ `user` est toujours présent dans les événements persistés, et doit être `null` pour les actions système, jamais omis.
 *
 * EN 🇬🇧 — How to extend the contract?
 *  - The immutable nucleus (`timestamp`, `action`, `hmac`) is guaranteed by the library.
 *  - Put your domain payload in `details` using the generic parameter `D` on `AuditEvent`/`InputEvent`.
 *  - Best practice: keep custom data **inside `details`** only.
 *  - The HMAC also covers `details`, so any tampering is detected.
 *  - With `exactOptionalPropertyTypes`, `undefined` fields are **omitted** when serialized.
 *  - The `user` field is always present in persisted events and must be `null` for system actions, never omitted.
 *
 * EXAMPLE / EXEMPLE
 *  -----------------
 *  // Define your custom details shape
 *  interface ProjectDetails {
 *    projectId: string;
 *    name: string;
 *    secretMasked?: string; // already redacted in app code
 *  }
 *
 *  // When producing events (compile-time type help)
 *  // InputEvent<ProjectDetails> narrows the `details` shape you pass
 *  // (The library itself accepts any Record<string, unknown> at runtime.)
 *  type ProjectInput = InputEvent<ProjectDetails>;
 *
 *  const evt: ProjectInput = {
 *    action: "createProject",
 *    entity: "Project",
 *    outcome: "success",
 *    details: { projectId: "P-123", name: "WindFarm-EU" },
 *    // timestamp is optional here (auto-filled by the library)
 *  };
 *
 *  // When consuming/parsing events (e.g., reading audit.log), you can type it too:
 *  type ProjectAudit = AuditEvent<ProjectDetails>;
 *
 *  // ✅ Compatibility note:
 *  //   - Extending `details` with your own shape does NOT break the library.
 *  //   - The core remains untouched; the HMAC covers all included fields.
 *  //   - If you do nothing, `D` defaults to `Record<string, unknown>`.
 */

export type AuditOutcome = "success" | "error";

export interface AuditUser {
  id: string;
  name?: string;
}

export interface AuditContext {
  // user peut être fourni, absent, ou explicitement null (system)
  user?: AuditUser | null; // null = système, undefined = non fourni (sera aussi normalisé en null)
  // ... autres champs de contexte
}

/**
 * Core fields that MUST exist and are covered by the HMAC.
 * These are the non-negotiable pillars for auditability.
 */
export interface BaseAuditEventCore {
  /** ISO timestamp (UTC recommended) */
  timestamp: string;
  /** Business action name, e.g. "createProject" */
  action: string;
  /** HMAC signature computed over all other fields (excluding itself) */
  hmac: string;
}

/**
 * Optional standard envelope fields (reserved names).
 * These are part of the signed payload when present.
 */
export interface AuditEnvelope {
  user?: AuditUser | null;
  entity?: string; // e.g., "Project"
  requestId?: string; // correlation/trace id
  outcome?: AuditOutcome;
  error?: { name: string; message: string; stack?: string };
  keyId?: string; // HMAC key version
  prevHmac?: string; // chain linkage for tamper-evidence
}

/**
 * Canonical envelope used in persisted/logged events.
 * In canonical form, `user` MUST always exist:
 *  - human user → AuditUser
 *  - system     → null
 * Never omit the field (avoid undefined) to disambiguate "system" from "not provided".
 */
export interface AuditEnvelopeCanonical extends Omit<AuditEnvelope, "user"> {
  /** Always present; null means "system" */
  user: AuditUser | null;
}

/**
 * Full audit event with an extensible `details` bag.
 * Users can strongly type their `details` while the core remains intact.
 */
export type AuditEvent<
  D extends Record<string, unknown> = Record<string, unknown>,
> = BaseAuditEventCore &
  AuditEnvelopeCanonical & {
    /** Free-form, user-defined, but typed by the library consumer */
    details?: D;
  };

/**
 * Input contract before signing. Library computes `timestamp` (if absent) and `hmac`.
 * Exposed for convenience if consumers want strong types on their custom details.
 */
export type InputEvent<
  D extends Record<string, unknown> = Record<string, unknown>,
> = Omit<AuditEvent<D>, "timestamp" | "hmac" | "user"> & {
  /** Allow caller to override timestamp if needed */
  timestamp?: string;
  /**
   * Optional at input time:
   *  - provide AuditUser to attribute the action to a human
   *  - omit or set null to mark "system"
   * The library canonicalizes to `user: null` when absent.
   */
  user?: AuditUser | null;
};
