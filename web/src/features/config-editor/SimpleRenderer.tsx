import { useMemo } from 'react';

type Props = { schema: any; data: any; onChange: (next: any)=>void; section: string };

// Resolve $ref in schema by looking up in root schema
function resolveRef(ref: string, rootSchema: any): any {
  if (!ref || !ref.startsWith('#/')) return null;
  const path = ref.substring(2).split('/');
  let current = rootSchema;
  for (const part of path) {
    if (!current || typeof current !== 'object') return null;
    current = current[part];
  }
  return current;
}

// Resolve schema handling $ref, anyOf, allOf, oneOf
function resolveSchema(schema: any, rootSchema: any): any {
  if (!schema) return null;

  // Handle $ref
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, rootSchema);
    if (resolved) return resolveSchema(resolved, rootSchema);
  }

  // Handle anyOf - take first option (simple heuristic)
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    return resolveSchema(schema.anyOf[0], rootSchema);
  }

  // Handle allOf - merge all schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    let merged: any = { ...schema };
    delete merged.allOf;
    for (const subSchema of schema.allOf) {
      const resolved = resolveSchema(subSchema, rootSchema);
      if (resolved) {
        merged = { ...merged, ...resolved };
        if (resolved.properties) {
          merged.properties = { ...merged.properties, ...resolved.properties };
        }
      }
    }
    return merged;
  }

  // Handle oneOf - take first option (simple heuristic)
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    return resolveSchema(schema.oneOf[0], rootSchema);
  }

  return schema;
}

const ptrToDot = (p: string) => p.replace(/^\//, '').replace(/\//g, '.');

function buildErrorMap(errors: any[] | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  (errors || []).forEach((err) => {
    const key = ptrToDot(err.instancePath || '');
    const msg = err.message || 'Invalid value';
    if (!out[key]) out[key] = [];
    out[key].push(msg);
  });
  return out;
}

function getErrorsForPath(map: Record<string, string[]>, path: string[]): string[] {
  const key = path.join('.');
  return map[key] || [];
}

function Field({ path, subschema, value, onChange, errorsFor, rootSchema }: any) {
  // Resolve schema to handle $ref, anyOf, etc.
  const resolved = useMemo(() => resolveSchema(subschema, rootSchema), [subschema, rootSchema]);

  const type = resolved?.type;
  const title = resolved?.title || path[path.length - 1];
  const desc = resolved?.description;
  const errs = errorsFor(path);
  const Err = () =>
    errs.length ? (
      <div class="text-xs text-destructive mt-1">{errs.join('; ')}</div>
    ) : null;

  if (type === 'boolean') {
    return (
      <label class="flex items-center gap-2 py-1">
        <input type="checkbox" checked={!!value} onChange={() => onChange(!value)} />
        <span class="font-medium">{title}</span>
        {desc && <span class="text-xs text-muted-foreground"> — {desc}</span>}
        <Err />
      </label>
    );
  }
  if (type === 'number' || type === 'integer') {
    return (
      <label class="block py-1">
        <span class="font-medium">{title}</span>
        <input
          class="border rounded w-full p-2"
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange((e.target as HTMLInputElement).valueAsNumber)}
        />
        {desc && <div class="text-xs text-muted-foreground">{desc}</div>}
        <Err />
      </label>
    );
  }
  if (type === 'string') {
    if (resolved.enum) {
      return (
        <label class="block py-1">
          <span class="font-medium">{title}</span>
          <select
            class="border rounded w-full p-2"
            value={value ?? ''}
            onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
          >
            <option value=""></option>
            {resolved.enum.map((v: any) => (
              <option key={String(v)} value={v}>
                {String(v)}
              </option>
            ))}
          </select>
          {desc && <div class="text-xs text-muted-foreground">{desc}</div>}
          <Err />
        </label>
      );
    }
    return (
      <label class="block py-1">
        <span class="font-medium">{title}</span>
        <input
          class="border rounded w-full p-2"
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        />
        {desc && <div class="text-xs text-muted-foreground">{desc}</div>}
        <Err />
      </label>
    );
  }
  if (type === 'object') {
    // Check if it's a map/dictionary (additionalProperties) vs fixed properties
    if (resolved.additionalProperties && !resolved.properties) {
      // This is a map like cameras: { camera_name: CameraConfig }
      const items = value && typeof value === 'object' ? Object.keys(value) : [];
      return (
        <div class="border rounded p-3 my-2">
          <div class="font-semibold mb-1">{title}</div>
          {desc && <div class="text-xs text-muted-foreground mb-2">{desc}</div>}
          {items.map((itemKey) => (
            <div key={itemKey} class="border rounded p-2 my-2">
              <div class="flex items-center justify-between mb-2">
                <span class="font-medium">{itemKey}</span>
                <button
                  class="border rounded px-2 py-1 text-xs"
                  onClick={() => {
                    const next = { ...value };
                    delete next[itemKey];
                    onChange(next);
                  }}
                >
                  Remove
                </button>
              </div>
              <Field
                path={[...path, itemKey]}
                subschema={resolved.additionalProperties}
                value={value?.[itemKey]}
                onChange={(v: any) => onChange({ ...(value || {}), [itemKey]: v })}
                errorsFor={errorsFor}
                rootSchema={rootSchema}
              />
            </div>
          ))}
          <button
            class="mt-2 border rounded px-3 py-1 text-sm"
            onClick={() => {
              const newKey = prompt('Enter name for new item:');
              if (newKey && newKey.trim()) {
                onChange({ ...(value || {}), [newKey.trim()]: {} });
              }
            }}
          >
            + Add {title}
          </button>
          <Err />
        </div>
      );
    }

    // Fixed properties object
    if (resolved.properties) {
      const keys = Object.keys(resolved.properties);
      return (
        <div class="border rounded p-3 my-2">
          <div class="font-semibold mb-1">{title}</div>
          {keys.map((k) => (
            <Field
              key={k}
              path={[...path, k]}
              subschema={(resolved.properties as any)[k]}
              value={value?.[k]}
              onChange={(v: any) => onChange({ ...(value || {}), [k]: v })}
              errorsFor={errorsFor}
              rootSchema={rootSchema}
            />
          ))}
          <Err />
        </div>
      );
    }
  }
  if (type === 'array') {
    const items = Array.isArray(value) ? value : [];
    return (
      <div class="border rounded p-3 my-2">
        <div class="font-semibold mb-1">{title}</div>
        {items.map((it: any, idx: number) => (
          <div class="flex items-center gap-2 py-1" key={idx}>
            <input
              class="border rounded flex-1 p-2"
              type="text"
              value={String(it)}
              onChange={(e) => {
                const next = items.slice();
                next[idx] = (e.target as HTMLInputElement).value;
                onChange(next);
              }}
            />
            <button
              class="border rounded px-2 py-1"
              onClick={() => onChange(items.filter((_: any, i: number) => i !== idx))}
            >
              -
            </button>
          </div>
        ))}
        <button
          class="mt-1 border rounded px-2 py-1"
          onClick={() => onChange([...(items || []), ''])}
        >
          + Add
        </button>
        {desc && <div class="text-xs text-muted-foreground">{desc}</div>}
        <Err />
      </div>
    );
  }
  return <div class="text-xs text-muted-foreground">Unsupported field: {title}</div>;
}

export default function SimpleRenderer({ schema, data, onChange, section }: Props) {
  // Skip validation for now - just render the form
  const errorsFor = () => [];

  return (
    <div class="p-4">
      <Field
        path={[section]}
        subschema={(schema.properties || {})[section]}
        value={data?.[section]}
        onChange={(next: any) => onChange({ [section]: next })}
        errorsFor={errorsFor}
        rootSchema={schema}
      />
    </div>
  );
}
