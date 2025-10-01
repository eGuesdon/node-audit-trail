import { readFile } from "node:fs/promises";

export async function getLastHmacFromFile(
  path: string,
): Promise<string | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    if (!lines.length) return undefined;
    const last = JSON.parse(lines[lines.length - 1]);
    return last?.hmac;
  } catch {
    return undefined;
  }
}
