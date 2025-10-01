type Json = any;

const isObject = (v: any) => v && typeof v === "object" && !Array.isArray(v);

function flatten(
  obj: any,
  prefix = "",
): Record<string, string | number | boolean | null | undefined | Array<any>> {
  const out: Record<string, any> = {};

  if (Array.isArray(obj)) {
    obj.forEach((v, i) => Object.assign(out, flatten(v, `${prefix}${prefix ? "." : ""}${i}`)));
  } else if (isObject(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      Object.assign(out, flatten(v, `${prefix}${prefix ? "." : ""}${k}`));
    }
  } else {
    out[prefix] = obj;
  }

  return out;
}

// conservative URL budget to avoid 414 at proxies (nginx ~8KB; keep small margin)
const URL_BUDGET = 3500;

function serializeValue(v: any): string | undefined {
  if (Array.isArray(v) && v.every((n) => typeof n === "number")) return v.join(",");
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v === undefined) return undefined; // skip undefined to avoid accidental deletes
  if (v === null) return ""; // allow explicit empty string when null
  return String(v);
}

export function diffToParamPairs(original: Json, edited: Json): string[] {
  const a = flatten(original);
  const b = flatten(edited);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const pairs: string[] = [];

  for (const k of keys) {
    const vOld = (a as any)[k];
    const vNew = (b as any)[k];
    const changed = Array.isArray(vNew)
      ? JSON.stringify(vNew) !== JSON.stringify(vOld)
      : vNew !== vOld;

    if (!changed) continue;
    const val = serializeValue(vNew);
    if (k && val !== undefined) {
      pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
    }
  }

  return pairs;
}

export function chunkParamPairs(pairs: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const p of pairs) {
    const addLen = (current.length ? 1 : 0) + p.length; // '&' between pairs
    if (currentLen + addLen > URL_BUDGET) {
      if (current.length) chunks.push(current);
      current = [p];
      currentLen = p.length;
    } else {
      current.push(p);
      currentLen += addLen;
    }
  }

  if (current.length) chunks.push(current);
  return chunks;
}

