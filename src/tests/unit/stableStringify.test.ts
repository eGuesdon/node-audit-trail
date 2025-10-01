/* eslint-env jest */
// ↑ Informe ESLint que `describe`, `test`, `expect` sont des globals de Jest.

import { describe, test, expect } from "vitest";

import { stableStringify } from "../../audit/stableStringify.js";

describe("stableStringify", () => {
  test("tri des clés + normalisation Unicode NFC (clés et valeurs)", () => {
    // é en NFD (e + accent) vs é en NFC
    const objNFD = { "e\u0301": "cafe\u0301", b: 1, a: 2 };
    const objNFC = { a: 2, b: 1, é: "café" };

    const s1 = stableStringify(objNFD);
    const s2 = stableStringify(objNFC);

    expect(s1).toBe(s2);
    // Les clés doivent être triées (a, b, é)
    expect(s1.indexOf('"a"')).toBeLessThan(s1.indexOf('"b"'));
    expect(s1.indexOf('"b"')).toBeLessThan(s1.indexOf('"\u00E9"')); // "é"
  });

  test("NaN / Infinity / -Infinity encodés sans casser JSON", () => {
    const s = stableStringify({
      n: Number.NaN,
      p: Number.POSITIVE_INFINITY,
      m: Number.NEGATIVE_INFINITY,
    });
    expect(s).toContain('"__nonfinite__","NaN"');
    expect(s).toContain('"__nonfinite__","Infinity"');
    expect(s).toContain('"__nonfinite__","-Infinity"');
    expect(() => JSON.parse(s)).not.toThrow();
  });

  test("BigInt encodé de manière déterministe", () => {
    const s = stableStringify({ big: 123n });
    expect(s).toContain('"__bigint__","123"');
    expect(() => JSON.parse(s)).not.toThrow();
  });

  test("-0 normalisé en 0 (évite ambiguités de représentation)", () => {
    const sNeg0 = stableStringify({ x: -0 });
    const s0 = stableStringify({ x: 0 });
    expect(sNeg0).toBe(s0);
    expect(s0).toContain('"x":0');
  });

  test("undefined représenté explicitement", () => {
    const s = stableStringify({ x: undefined, y: [undefined] });
    expect(s).toContain('"__undefined__"');
    expect(() => JSON.parse(s)).not.toThrow();
  });

  test("Date: iso par défaut et unixMs en option", () => {
    const d = new Date("2025-10-02T12:34:56.000Z");
    const sIso = stableStringify({ d });
    expect(sIso).toContain('"__date__","2025-10-02T12:34:56.000Z"');

    const sMs = stableStringify({ d }, { dateMode: "unixMs" });
    expect(sMs).toMatch(/"__date_unixms__","\d+"/);
  });

  test("Map: représentation canonique (ordre indépendant)", () => {
    const m1: Map<string, number> = new Map([
      ["b", 2],
      ["a", 1],
    ]);
    const m2: Map<string, number> = new Map([
      ["a", 1],
      ["b", 2],
    ]);

    const s1 = stableStringify(m1);
    const s2 = stableStringify(m2);
    expect(s1).toBe(s2);
    expect(s1).toContain('"__map__"');
  });

  test("Set: représentation canonique triée", () => {
    const s1 = new Set<number>([3, 1, 2]);
    const s2 = new Set<number>([2, 3, 1]);

    const j1 = stableStringify(s1);
    const j2 = stableStringify(s2);
    expect(j1).toBe(j2);
    expect(j1).toContain('"__set__"');
  });

  test("Buffer / TypedArray → base64 stable", () => {
    const payload = [0, 1, 2, 3, 254, 255];
    const buf = Buffer.from(payload);
    const ta = new Uint8Array(payload);

    const sbuf = stableStringify({ buf });
    const sta = stableStringify({ ta });

    const b64 = Buffer.from(payload).toString("base64");
    expect(sbuf).toContain(`"__bytes_b64__","${b64}"`);
    expect(sta).toContain(`"__bytes_b64__","${b64}"`);
  });

  test("Cycles: par défaut marqué, optionnellement throw", () => {
    const a: { x: number; self?: unknown } = { x: 1 };
    a.self = a as unknown;

    const s = stableStringify(a);
    expect(s).toContain('"__cycle__"');

    expect(() => stableStringify(a, { onCycle: "throw" })).toThrow(/Cycle/);
  });

  test("Robustesse à l’ordre d’insertion de propriétés", () => {
    const base: Record<string, string> = {
      k1: "v1",
      k2: "v2",
      k3: "v3",
      k4: "v4",
      k5: "v5",
    };
    const permutations: Array<Array<keyof typeof base>> = [
      ["k1", "k2", "k3", "k4", "k5"],
      ["k5", "k4", "k3", "k2", "k1"],
      ["k2", "k4", "k1", "k5", "k3"],
    ];

    const strings = permutations.map((order) => {
      const o: Record<string, string> = {};
      for (const k of order) {
        o[k as string] = base[k]!;
      }
      return stableStringify(o);
    });

    for (let i = 1; i < strings.length; i += 1) {
      expect(strings[i]).toBe(strings[0]);
    }
  });

  test("Égalité logique malgré variations Unicode (NFD vs NFC) dans tableaux", () => {
    const arr1 = ["cafe\u0301", "re\u0301sume\u0301"]; // NFD
    const arr2 = ["café", "résumé"]; // NFC
    expect(stableStringify(arr1)).toBe(stableStringify(arr2));
  });
});
