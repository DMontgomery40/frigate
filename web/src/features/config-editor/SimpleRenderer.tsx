import { useMemo, useState } from 'react';
import { getFieldHelp } from './fieldHelp';

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

// Help icon with popup
function HelpIcon({ path }: { path: string[] }) {
  const [showHelp, setShowHelp] = useState(false);
  const help = getFieldHelp(path);

  if (!help) return null;

  return (
    <>
      <button
        type="button"
        className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full border border-muted-foreground text-muted-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground cursor-pointer"
        onClick={() => setShowHelp(true)}
        title="Click for help"
        style={{ minWidth: '20px', minHeight: '20px', lineHeight: '20px' }}
      >
        ?
      </button>
      {showHelp && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-background border rounded-lg p-4 max-w-lg m-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-lg">{path[path.length - 1]}</h3>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setShowHelp(false)}
              >
                ✕
              </button>
            </div>
            <div className="text-sm space-y-3">
              <p className="text-foreground">{help.description}</p>
              {help.example && (
                <div>
                  <div className="font-medium mb-1">Example:</div>
                  <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                    {help.example}
                  </pre>
                </div>
              )}
              {help.docsUrl && (
                <a
                  href={help.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-primary hover:underline"
                >
                  📖 View documentation →
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
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
      <div className="text-xs text-destructive mt-1">{errs.join('; ')}</div>
    ) : null;

  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" checked={!!value} onChange={() => onChange(!value)} />
        <span className="font-medium inline-flex items-center">
          {title}
          <HelpIcon path={path} />
        </span>
        {desc && <span className="text-xs text-muted-foreground"> — {desc}</span>}
        <Err />
      </label>
    );
  }
  if (type === 'number' || type === 'integer') {
    return (
      <label className="block py-1">
        <span className="font-medium inline-flex items-center">
          {title}
          <HelpIcon path={path} />
        </span>
        <input
          className="border rounded w-full p-2 bg-background text-foreground"
          type="number"
          value={value ?? ''}
          onChange={(e) => {
            const val = (e.target as HTMLInputElement).valueAsNumber;
            onChange(isNaN(val) ? undefined : val);
          }}
        />
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
        <Err />
      </label>
    );
  }
  if (type === 'string') {
    if (resolved.enum) {
      return (
        <label className="block py-1">
          <span className="font-medium inline-flex items-center">
            {title}
            <HelpIcon path={path} />
          </span>
          <select
            className="border rounded w-full p-2 bg-background text-foreground"
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
          {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
          <Err />
        </label>
      );
    }
    return (
      <label className="block py-1">
        <span className="font-medium inline-flex items-center">
          {title}
          <HelpIcon path={path} />
        </span>
        <input
          className="border rounded w-full p-2 bg-background text-foreground"
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        />
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
        <Err />
      </label>
    );
  }
  if (type === 'object') {
    // Check if it's a map/dictionary (additionalProperties) vs fixed properties
    if (resolved.additionalProperties && !resolved.properties) {
      // This is a map like cameras: { camera_name: CameraConfig } or environment_vars: { KEY: "value" }
      const items = value && typeof value === 'object' ? Object.keys(value) : [];
      const additionalPropsSchema = resolved.additionalProperties;
      const isSimpleType = typeof additionalPropsSchema === 'object' &&
        (additionalPropsSchema.type === 'string' || additionalPropsSchema.type === 'number' || additionalPropsSchema.type === 'boolean');

      // Default value for new items based on type
      const getDefaultValue = () => {
        if (typeof additionalPropsSchema === 'object' && additionalPropsSchema.type === 'string') return '';
        if (typeof additionalPropsSchema === 'object' && additionalPropsSchema.type === 'number') return 0;
        if (typeof additionalPropsSchema === 'object' && additionalPropsSchema.type === 'boolean') return false;
        return {}; // Complex object
      };

      return (
        <div className="border rounded p-3 my-2">
          <div className="font-semibold mb-1 inline-flex items-center">
            {title}
            <HelpIcon path={path} />
          </div>
          {desc && <div className="text-xs text-muted-foreground mb-2">{desc}</div>}
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground mb-2 italic">
              No items yet. Click "+ Add" below to create one.
            </div>
          )}
          {items.map((itemKey) => (
            <div key={itemKey} className="border rounded p-2 my-2">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{itemKey}</span>
                <button
                  className="border rounded px-2 py-1 text-xs bg-background text-foreground hover:bg-muted"
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
            className="mt-2 border rounded px-3 py-1 text-sm bg-background text-foreground hover:bg-muted"
            onClick={() => {
              const newKey = prompt('Enter name for new item:');
              if (newKey && newKey.trim()) {
                onChange({ ...(value || {}), [newKey.trim()]: getDefaultValue() });
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
        <div className="border rounded p-3 my-2">
          <div className="font-semibold mb-1">{title}</div>
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
      <div className="border rounded p-3 my-2">
        <div className="font-semibold mb-1">{title}</div>
        {items.map((it: any, idx: number) => (
          <div className="flex items-center gap-2 py-1" key={idx}>
            <input
              className="border rounded flex-1 p-2 bg-background text-foreground"
              type="text"
              value={String(it)}
              onChange={(e) => {
                const next = items.slice();
                next[idx] = (e.target as HTMLInputElement).value;
                onChange(next);
              }}
            />
            <button
              className="border rounded px-2 py-1 bg-background text-foreground hover:bg-muted"
              onClick={() => onChange(items.filter((_: any, i: number) => i !== idx))}
            >
              -
            </button>
          </div>
        ))}
        <button
          className="mt-1 border rounded px-2 py-1 bg-background text-foreground hover:bg-muted"
          onClick={() => onChange([...(items || []), ''])}
        >
          + Add
        </button>
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
        <Err />
      </div>
    );
  }
  return <div className="text-xs text-muted-foreground">Unsupported field: {title}</div>;
}

export default function SimpleRenderer({ schema, data, onChange, section }: Props) {
  // Skip validation for now - just render the form
  const errorsFor = () => [];

  return (
    <div className="p-4">
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
