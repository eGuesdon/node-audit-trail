// src/audit/fileSink.ts
import { promises as fs } from "node:fs";

import type { AuditSink } from "../types.js";

/**
 * FileJsonlSink
 * Reçoit une chaîne JSON (déjà stringifiée par AuditClient) et l’écrit telle quelle (JSONL).
 * Ne JAMAIS re-stringifier ici. Ajoute juste un saut de ligne.
 * Inclut un garde-fou anti double-stringify (déquote une seule fois "\"{...}\"" -> "{...}").
 */
export class FileJsonlSink implements AuditSink {
  constructor(private path: string) {}

  async write(line: string): Promise<void> {
    // Déquote si on reçoit accidentellement "\"{...}\""
    let out = line;
    const trimmed = out.trimEnd();
    if (
      trimmed.length > 1 &&
      trimmed.startsWith('"') &&
      trimmed.endsWith('"')
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "string") {
          const ps = parsed.trim();
          if (ps.startsWith("{") && ps.endsWith("}")) {
            out = parsed; // repasse à du JSON brut
          }
        }
      } catch {
        // ignore
      }
    }
    const normalized = out.endsWith("\n") ? out : out + "\n";
    await fs.appendFile(this.path, normalized, "utf8");
  }

  async drain(): Promise<void> {
    /* no-op */
  }
  async close(): Promise<void> {
    /* no-op */
  }
}
