// src/audit/sinks/AsyncRotatingFileSink.ts
import { promises as fs } from "node:fs";
import type { WriteStream } from "node:fs";
import { createWriteStream } from "node:fs";
import { dirname, basename, extname } from "node:path";

import type { AuditSink } from "../types.js";

export type BackpressureMode = "block" | "drop";

export interface RotatingSinkOptions {
  /** Fichier de base (ex: ./logs/audit.log) */
  path: string;
  /** Taille max avant rotation (octets). 0 = désactivé. Défaut: 50 MiB */
  maxBytes?: number;
  /** Rotation quotidienne (YYYY-MM-DD). Défaut: true */
  rotateDaily?: boolean;
  /** Capacité de queue (nb de lignes). Défaut: 5000 */
  highWaterMark?: number;
  /** back-pressure : block (attente) | drop (jette). Défaut: "block" */
  backpressureMode?: BackpressureMode;
  /** Callback erreur non fatale */
  onError?: (err: unknown) => void;
}

export class AsyncRotatingFileSink implements AuditSink {
  private readonly opts: Required<RotatingSinkOptions>;
  private queue: string[] = [];
  private writing = false;
  private closing = false;
  private ws: WriteStream | null = null;
  private currentDay = "";
  private baseSize = 0;

  constructor(opts: RotatingSinkOptions) {
    this.opts = {
      maxBytes: 50 * 1024 * 1024,
      rotateDaily: true,
      highWaterMark: 5000,
      backpressureMode: "block",
      onError: (e) => console.warn("[audit] sink error:", e),
      ...opts,
    };
  }

  async write(line: string): Promise<void> {
    // Defensive: if we accidentally receive a double-stringified JSON line (e.g., "\"{...}\""),
    // unescape it once to keep JSONL clean. Be tolerant of trailing newline/whitespace.
    let out = line;
    const trimmed = out.trimEnd(); // ignore trailing \n or \r\n when detecting quotes
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
            out = parsed; // keep original spacing; newline will be re-added below
          }
        }
      } catch {
        // ignore parse error, keep original
      }
    }
    if (this.closing) return; // on ignore pendant fermeture
    const normalized = out.endsWith("\n") ? out : out + "\n";

    if (this.queue.length >= this.opts.highWaterMark) {
      if (this.opts.backpressureMode === "drop") return;
      // block: attendre une fenêtre
      while (this.queue.length >= this.opts.highWaterMark && !this.closing) {
        await new Promise((r) => setTimeout(r, 5));
      }
      if (this.closing) return;
    }

    this.queue.push(normalized);
    if (!this.writing) void this.flushLoop();
  }

  async drain(): Promise<void> {
    // attendre tant qu'il reste quelque chose à écrire
    while (this.writing || this.queue.length) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.drain();
    if (this.ws) {
      await new Promise<void>((res) => {
        this.ws!.end(() => res());
      });
      this.ws = null;
    }
  }

  // -------- interne --------
  private async flushLoop(): Promise<void> {
    this.writing = true;
    try {
      while (this.queue.length) {
        await this.ensureStream();
        const chunk = this.queue.shift()!;
        if (!this.ws!.write(chunk)) {
          await new Promise<void>((res) => this.ws!.once("drain", res));
        }
        await this.maybeRotate();
      }
    } catch (e) {
      this.opts.onError(e);
    } finally {
      this.writing = false;
    }
  }

  private dayKey(d = new Date()): string {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private currentPath(dayKey: string): string {
    if (!dayKey) return this.opts.path;
    const dir = dirname(this.opts.path);
    const base = basename(this.opts.path, extname(this.opts.path));
    const ext = extname(this.opts.path) || ".log";
    return `${dir}/${base}-${dayKey}${ext}`;
  }

  private async ensureStream(): Promise<void> {
    const dayKey = this.opts.rotateDaily ? this.dayKey() : "";
    if (this.ws && dayKey === this.currentDay) return;

    await fs
      .mkdir(dirname(this.opts.path), { recursive: true })
      .catch(() => {});
    if (this.ws) {
      await new Promise<void>((res) => this.ws!.end(() => res()));
    }
    const p = this.currentPath(dayKey);
    const st = await fs.stat(p).catch(() => null);
    this.baseSize = st?.size ?? 0;
    this.ws = createWriteStream(p, { flags: "a" });
    this.currentDay = dayKey;
  }

  private async maybeRotate(): Promise<void> {
    if (!this.opts.maxBytes) return;
    if (!this.ws) return;
    const p = this.currentPath(this.currentDay);
    const currentSize = this.baseSize + (this.ws.bytesWritten ?? 0);
    if (currentSize < this.opts.maxBytes) return;

    // rotation par taille: renommer avec timestamp compact
    const ts = new Date().toISOString().replace(/[:.]/g, "");
    const ext = extname(p);
    const rotated = ext ? p.replace(ext, `.${ts}${ext}`) : `${p}.${ts}`;

    await new Promise<void>((res) => this.ws!.end(() => res()));
    this.ws = null;
    this.baseSize = 0;
    await fs.rename(p, rotated).catch(this.opts.onError);
    // le prochain write recréera le stream via ensureStream()
  }
}
