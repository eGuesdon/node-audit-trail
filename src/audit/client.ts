import type { AuditEvent } from "./types.js";
import { computeHmac } from "./hmac.js";

// Input event: tout sauf les champs calculés ici
export type InputEvent = Omit<AuditEvent, "timestamp" | "hmac"> & {
  timestamp?: string; // autorise la surcouche si besoin
};

export type AuditClientOptions = {
  signingKey: string;
  keyId?: string;
  chain?: boolean; // active le chaînage prevHmac
  seedPrevHmac?: string; // graine de chaînage (persiste entre runs)
  sink: { write(e: AuditEvent): Promise<void> };
};

// Supprime les propriétés à valeur undefined (pour exactOptionalPropertyTypes)
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export class AuditClient {
  private lastHmac: string | undefined;
  private keyId: string | undefined;
  private chain: boolean;
  private signingKey: string;
  private sink: { write(e: AuditEvent): Promise<void> };

  constructor(opts: AuditClientOptions) {
    this.signingKey = opts.signingKey;
    this.keyId = opts.keyId;
    this.chain = opts.chain ?? true;
    this.sink = opts.sink;
    this.lastHmac = opts.seedPrevHmac; // initialise la chaîne si fourni
  }

  async log(e: InputEvent): Promise<AuditEvent> {
    const baseRaw = {
      timestamp: e.timestamp ?? new Date().toISOString(),
      user: e.user, // null autorisé ; undefined sera omis
      action: e.action,
      entity: e.entity, // omis si undefined
      details: e.details, // omis si undefined
      requestId: e.requestId, // omis si undefined
      outcome: e.outcome, // omis si undefined
      error: e.error, // omis si undefined
      keyId: this.keyId, // omis si undefined
      prevHmac: this.chain ? this.lastHmac : undefined,
    };

    // Retire les undefined pour satisfaire exactOptionalPropertyTypes
    const base = pruneUndefined(baseRaw) as Omit<AuditEvent, "hmac">;

    const hmac = computeHmac(this.signingKey, base);
    const full: AuditEvent = { ...base, hmac };

    if (this.chain) this.lastHmac = hmac;

    await this.sink.write(full);
    return full;
  }
}
