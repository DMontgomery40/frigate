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

  // Detect actual type from value if schema is ambiguous
  let type = resolved?.type;
  if (Array.isArray(value)) {
    type = 'array';
  } else if (typeof value === 'object' && value !== null && !type) {
    type = 'object';
  }

  const title = resolved?.title || path[path.length - 1];
  const desc = resolved?.description;
  const errs = errorsFor(path);
  const Err = () =>
    errs.length ? (
      <div className="text-xs text-destructive mt-1">{errs.join('; ')}</div>
    ) : null;

  if (type === 'boolean') {
    return (
      <div className="py-2">
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={!!value} onChange={() => onChange(!value)} className="mt-1" />
          <div className="flex-1">
            <span className="font-medium inline-flex items-center flex-wrap">
              {title}
              <HelpIcon path={path} />
            </span>
            {desc && <div className="text-xs text-muted-foreground mt-1">{desc}</div>}
          </div>
        </label>
        <Err />
      </div>
    );
  }
  if (type === 'number' || type === 'integer') {
    return (
      <label className="block py-2">
        <span className="font-medium inline-flex items-center flex-wrap mb-1">
          {title}
          <HelpIcon path={path} />
        </span>
        <input
          className="border rounded-md w-full p-2 bg-background text-foreground text-base"
          type="number"
          value={value ?? ''}
          onChange={(e) => {
            const val = (e.target as HTMLInputElement).valueAsNumber;
            onChange(isNaN(val) ? undefined : val);
          }}
        />
        {desc && <div className="text-xs text-muted-foreground mt-1">{desc}</div>}
        <Err />
      </label>
    );
  }
  if (type === 'string') {
    if (resolved.enum) {
      return (
        <label className="block py-2">
          <span className="font-medium inline-flex items-center flex-wrap mb-1">
            {title}
            <HelpIcon path={path} />
          </span>
          <select
            className="border rounded-md w-full p-2 bg-background text-foreground text-base"
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
          {desc && <div className="text-xs text-muted-foreground mt-1">{desc}</div>}
          <Err />
        </label>
      );
    }
    return (
      <label className="block py-2">
        <span className="font-medium inline-flex items-center flex-wrap mb-1">
          {title}
          <HelpIcon path={path} />
        </span>
        <input
          className="border rounded-md w-full p-2 bg-background text-foreground text-base"
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        />
        {desc && <div className="text-xs text-muted-foreground mt-1">{desc}</div>}
        <Err />
      </label>
    );
  }
  if (type === 'object') {
    // Check if it's a map/dictionary (additionalProperties) vs fixed properties
    const hasFixedProps = resolved.properties && Object.keys(resolved.properties).length > 0;
    if (resolved.additionalProperties && !hasFixedProps) {
      // This is a map like cameras: { camera_name: CameraConfig } or environment_vars: { KEY: "value" }
      const items = value && typeof value === 'object' ? Object.keys(value) : [];
      const additionalPropsSchema = resolved.additionalProperties;

      // If additionalProperties is just 'true', treat as any/object type
      const isSimpleType = additionalPropsSchema === true ||
        (typeof additionalPropsSchema === 'object' &&
        (additionalPropsSchema.type === 'string' || additionalPropsSchema.type === 'number' || additionalPropsSchema.type === 'boolean'));

      // Default value for new items based on type
      const getDefaultValue = () => {
        if (additionalPropsSchema === true) return {}; // When schema says "any additional properties allowed", default to empty object
        if (typeof additionalPropsSchema === 'object' && additionalPropsSchema.type === 'string') return '';
        if (typeof additionalPropsSchema === 'object' && additionalPropsSchema.type === 'number') return 0;
        if (typeof additionalPropsSchema === 'object' && additionalPropsSchema.type === 'boolean') return false;
        return {}; // Complex object
      };

      // Section-specific examples and guidance with expected item types
      const sectionGuidance: Record<string, { example?: string; hint: string; itemType?: 'array' | 'object' | 'string'; yamlOnly?: boolean; defaultValue?: any }> = {
        'go2rtc': {
          hint: '⚠️ Go2RTC has complex structure (nested objects + arrays) that the form cannot handle properly.\n\n✅ Use the YAML tab to configure Go2RTC.\n\nExample:\nstreams:\n  camera1: "rtsp://192.168.1.5:554/stream"\n  camera2:\n    - "rtsp://primary_url"\n    - "rtsp://backup_url"',
          yamlOnly: true
        },
        'environment_vars': {
          example: 'MY_VAR',
          hint: 'Add environment variables as key-value pairs (e.g., LIBVA_DRIVER_NAME, OPENCV_DNN_BACKEND)',
          itemType: 'string'
        },
        'cameras': {
          example: 'front_door',
          hint: 'Add a camera by name (e.g., front_door, driveway, backyard).\n\n💡 After adding, edit the RTSP path:\nrtsp://username:password@camera_ip:port/stream',
          itemType: 'object',
          defaultValue: {
            ffmpeg: {
              inputs: [{
                path: 'rtsp://username:password@192.168.1.100:554/stream',
                roles: ['detect']
              }]
            },
            enabled: true
          }
        },
      };

      const pathStr = path.join('.');
      // Only use EXACT path matches for guidance to prevent infinite nesting
      // Do NOT fall back to lastSegment matching
      const guidance = sectionGuidance[pathStr];

      // Override default value based on guidance
      const getDefaultValueWithGuidance = () => {
        if (guidance?.defaultValue !== undefined) return guidance.defaultValue;
        if (guidance?.itemType === 'array') return [];
        if (guidance?.itemType === 'string') return '';
        if (guidance?.itemType === 'object') return {};
        return getDefaultValue();
      };

      return (
        <div className="border rounded-md p-3 my-2">
          <div className="font-semibold mb-1 inline-flex items-center">
            {title}
            <HelpIcon path={path} />
          </div>
          {desc && <div className="text-xs text-muted-foreground mb-2">{desc}</div>}
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground mb-2">
              <div className="italic mb-2">No items configured yet.</div>
              {guidance && (
                <div className="bg-muted/50 rounded-md p-2 text-xs">
                  <div className="font-medium mb-1">💡 Example:</div>
                  <div className="mb-2 whitespace-pre-wrap">{guidance.hint}</div>
                  {guidance.example && (
                    <div>
                      <button
                        className="border rounded-md px-2 py-1 text-xs bg-background hover:bg-primary hover:text-primary-foreground"
                        onClick={() => {
                          const key = guidance.example!;
                          onChange({ ...(value || {}), [key]: getDefaultValueWithGuidance() });
                        }}
                      >
                        + Add "{guidance.example}"
                      </button>
                      {pathStr.includes('go2rtc') && (
                        <div className="mt-2 text-amber-600 text-xs">
                          💾 Remember to save after each step when building nested configs
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {items.map((itemKey) => (
            <div key={itemKey} className="border rounded-md p-2 my-2">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{itemKey}</span>
                <button
                  className="border rounded-md px-2 py-1 text-xs bg-background text-foreground hover:bg-muted"
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
                subschema={additionalPropsSchema === true ? { type: 'object', additionalProperties: true, properties: {} } : additionalPropsSchema}
                value={value?.[itemKey]}
                onChange={(v: any) => onChange({ ...(value || {}), [itemKey]: v })}
                errorsFor={errorsFor}
                rootSchema={rootSchema}
              />
            </div>
          ))}
          <button
            className="mt-2 border rounded-md px-3 py-1 text-sm bg-background text-foreground hover:bg-muted"
            onClick={() => {
              const newKey = prompt('Enter name for new item:');
              if (newKey && newKey.trim()) {
                onChange({ ...(value || {}), [newKey.trim()]: getDefaultValueWithGuidance() });
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
      const allKeys = Object.keys(resolved.properties);

      // Define essential fields to show by default for specific paths
      const essentialFieldsMap: Record<string, string[]> = {
        'cameras.*': ['ffmpeg', 'enabled'],  // ffmpeg first so camera URL is at top
        'cameras.*.ffmpeg': ['inputs'],
      };

      // Check if this path matches a pattern that has essential fields defined
      const pathPattern = path.map((p, i) => {
        // Replace dynamic values with wildcards for matching
        if (path[0] === 'cameras' && i === 1) return '*'; // camera names
        return p;
      }).join('.');

      const essentialFields = essentialFieldsMap[pathPattern];
      const [showAll, setShowAll] = useState(false);

      // Filter keys: show essential fields first, or all if no essential fields defined or showAll is true
      const keysToShow = !essentialFields || showAll
        ? allKeys
        : allKeys.filter(k => essentialFields.includes(k) || value?.[k] !== undefined);

      const hiddenCount = allKeys.length - keysToShow.length;

      return (
        <div className="border rounded-md p-3 my-2">
          <div className="font-semibold mb-1">{title}</div>
          {keysToShow.map((k) => (
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
          {hiddenCount > 0 && !showAll && (
            <button
              className="mt-2 text-xs text-primary hover:underline"
              onClick={() => setShowAll(true)}
            >
              + Show {hiddenCount} more advanced fields
            </button>
          )}
          <Err />
        </div>
      );
    }
  }
  if (type === 'array') {
    const items = Array.isArray(value) ? value : [];
    return (
      <div className="border rounded-md p-3 my-2">
        <div className="font-semibold mb-1">{title}</div>
        {items.map((it: any, idx: number) => (
          <div className="flex items-center gap-2 py-1" key={idx}>
            <input
              className="border rounded-md flex-1 p-2 bg-background text-foreground"
              type="text"
              value={String(it)}
              onChange={(e) => {
                const next = items.slice();
                next[idx] = (e.target as HTMLInputElement).value;
                onChange(next);
              }}
            />
            <button
              className="border rounded-md px-2 py-1 bg-background text-foreground hover:bg-muted"
              onClick={() => onChange(items.filter((_: any, i: number) => i !== idx))}
            >
              -
            </button>
          </div>
        ))}
        <button
          className="mt-1 border rounded-md px-2 py-1 bg-background text-foreground hover:bg-muted"
          onClick={() => {
            const newValue = prompt(`Enter value for ${title}:`);
            if (newValue !== null && newValue.trim()) {
              onChange([...(items || []), newValue.trim()]);
            }
          }}
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
