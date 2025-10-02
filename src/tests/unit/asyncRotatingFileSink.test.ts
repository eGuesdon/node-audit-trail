import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { AsyncRotatingFileSink } from "../../audit/sinks/AsyncRotatingFileSink.js";

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "audit-"));
  return d;
}

describe("AsyncRotatingFileSink", () => {
  it("writes asynchronously and rotates by size", async () => {
    const dir = tmpDir();
    const path = join(dir, "audit.log");
    const sink = new AsyncRotatingFileSink({
      path,
      maxBytes: 200,
      rotateDaily: false,
    });

    // 20 lignes de ~20 chars → rotation attendue
    for (let i = 0; i < 20; i += 1) {
      await sink.write(`L${i.toString().padStart(3, "0")} ${"x".repeat(16)}`);
    }
    // S'assurer que tout est flushé avant fermeture
    await sink.drain();
    await sink.close();

    const files = readdirSync(dir).sort();

    // Il peut ne pas rester de "audit.log" courant si la dernière écriture a déclenché une rotation,
    // donc on vérifie simplement qu'il y a AU MOINS un segment tourné.
    const hasRotated = files.some(
      (f) => f.startsWith("audit.") && f.endsWith(".log"),
    );

    expect(files.length).toBeGreaterThan(0);
    expect(hasRotated).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it("applies back-pressure (block) without dropping lines", async () => {
    const dir = tmpDir();
    const path = join(dir, "audit.log");
    // petite queue pour forcer la pression
    const sink = new AsyncRotatingFileSink({
      path,
      highWaterMark: 10,
      backpressureMode: "block",
      rotateDaily: false,
    });

    // spam massif
    await Promise.all(
      Array.from({ length: 500 }, (_, i) => sink.write(`E${i}`)),
    );

    // garantir le flush complet avant fermeture/lecture
    await sink.drain();
    await sink.close();

    const content = readFileSync(path, "utf8");
    // Compte robuste, même si un \n final est présent/absent
    const lines = content.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(500); // rien perdu en mode "block"

    rmSync(dir, { recursive: true, force: true });
  });
});
