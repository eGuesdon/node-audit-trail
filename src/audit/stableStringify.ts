// src/audit/stableStringify.ts

export type StableValue =
  | string
  | number
  | boolean
  | null
  | StableValue[]
  | { [k: string]: StableValue };

export interface StableStringifyOptions {
  unicodeForm?: "NFC" | "NFD" | "NFKC" | "NFKD"; // défaut: NFC
  onCycle?: "marker" | "throw"; // défaut: marker
  dateMode?: "iso" | "unixMs"; // défaut: iso
}

const DEFAULT_OPTS: Required<StableStringifyOptions> = {
  unicodeForm: "NFC",
  onCycle: "marker",
  dateMode: "iso",
};

export function stableStringify(
  value: unknown,
  opts: StableStringifyOptions = {},
): string {
  const { unicodeForm, onCycle, dateMode } = { ...DEFAULT_OPTS, ...opts };
  const seen = new WeakSet<object>();

  const normStr = (s: string) => s.normalize(unicodeForm);

  const encode = (v: unknown): StableValue => {
    const t = typeof v;
    if (v === null || t === "boolean" || t === "string") {
      return t === "string" ? normStr(v as string) : (v as StableValue);
    }

    if (t === "number") {
      const n = v as number;
      if (Number.isNaN(n)) return ["__nonfinite__", "NaN"];
      if (n === Infinity) return ["__nonfinite__", "Infinity"];
      if (n === -Infinity) return ["__nonfinite__", "-Infinity"];
      if (Object.is(n, -0)) return 0;
      return n;
    }

    if (t === "bigint") return ["__bigint__", (v as bigint).toString()];

    if (t === "undefined") return ["__undefined__"];

    if (t === "function" || t === "symbol") {
      return ["__unserializable__", t];
    }

    if (v instanceof Date) {
      return dateMode === "iso"
        ? ["__date__", v.toISOString()]
        : ["__date_unixms__", v.getTime().toString()];
    }

    if (isBufferLike(v)) {
      const buf = toNodeBuffer(v);
      return ["__bytes_b64__", buf.toString("base64")];
    }

    if (Array.isArray(v)) {
      return v.map(encode);
    }

    if (v instanceof Map) {
      const entries = Array.from(v.entries()).map(
        ([k, val]) => [encode(k), encode(val)] as [StableValue, StableValue],
      );
      entries.sort((a, b) => {
        const sa = JSON.stringify(a[0]);
        const sb = JSON.stringify(b[0]);
        return sa.localeCompare(sb);
      });
      return ["__map__", entries as unknown as StableValue];
    }

    if (v instanceof Set) {
      const arr = Array.from(v.values()).map(encode);
      arr.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return ["__set__", arr];
    }

    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) {
        if (onCycle === "throw") throw new Error("Cycle détecté");
        return ["__cycle__"];
      }
      seen.add(v);

      const out: Record<string, StableValue> = {};
      const keys = Object.keys(v as object).sort((a, b) =>
        a.normalize(unicodeForm).localeCompare(b.normalize(unicodeForm)),
      );
      for (const k of keys) {
        const nk = normStr(k);
        out[nk] = encode((v as Record<string, unknown>)[k]);
      }
      return out;
    }

    return ["__unknown__", Object.prototype.toString.call(v)];
  };

  return JSON.stringify(encode(value));
}

// Helpers binaires typés
function isBufferLike(x: unknown): boolean {
  return (
    (typeof Buffer !== "undefined" && Buffer.isBuffer?.(x)) ||
    ArrayBuffer.isView?.(x as ArrayBufferView) ||
    x instanceof ArrayBuffer
  );
}

function toNodeBuffer(x: unknown): Buffer {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(x)) return x as Buffer;
  if (x instanceof ArrayBuffer) return Buffer.from(new Uint8Array(x));
  if (ArrayBuffer.isView(x as ArrayBufferView)) {
    const view = x as ArrayBufferView;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  }
  return Buffer.from(String(x));
}
