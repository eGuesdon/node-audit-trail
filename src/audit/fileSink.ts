import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import type { AuditEvent } from "./types.js";

export class FileJsonlSink {
  constructor(private filePath: string) {}
  async write(event: AuditEvent): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, JSON.stringify(event) + "\n", "utf8");
  }
  path() {
    return this.filePath;
  }
}
