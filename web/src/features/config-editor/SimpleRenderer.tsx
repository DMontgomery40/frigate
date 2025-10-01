import React, { useMemo } from 'react';
import Ajv from 'ajv';

type Props = { schema: any; data: any; onChange: (next: any)=>void; section: string };

// Create Ajv instance that can handle $defs
const ajv = new Ajv({
  allErrors: true,
  coerceTypes: true,
  useDefaults: true,
  strict: false, // Allow $defs and other draft-2019-09 features
});

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

function Field({ path, subschema, value, onChange, errorsFor }: any) {
  const type = subschema?.type;
  const title = subschema?.title || path[path.length - 1];
  const desc = subschema?.description;
  const errs = errorsFor(path);
  const Err = () =>
    errs.length ? (
      <div className="text-xs text-destructive mt-1">{errs.join('; ')}</div>
    ) : null;

  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-2 py-1">
        <input type="checkbox" checked={!!value} onChange={() => onChange(!value)} />
        <span className="font-medium">{title}</span>
        {desc && <span className="text-xs text-muted-foreground"> — {desc}</span>}
        <Err />
      </label>
    );
  }
  if (type === 'number' || type === 'integer') {
    return (
      <label className="block py-1">
        <span className="font-medium">{title}</span>
        <input
          className="border rounded w-full p-2"
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange((e.target as HTMLInputElement).valueAsNumber)}
        />
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
        <Err />
      </label>
    );
  }
  if (type === 'string') {
    if (subschema.enum) {
      return (
        <label className="block py-1">
          <span className="font-medium">{title}</span>
          <select
            className="border rounded w-full p-2"
            value={value ?? ''}
            onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
          >
            <option value=""></option>
            {subschema.enum.map((v: any) => (
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
        <span className="font-medium">{title}</span>
        <input
          className="border rounded w-full p-2"
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        />
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
        <Err />
      </label>
    );
  }
  if (type === 'object' && subschema.properties) {
    const keys = Object.keys(subschema.properties);
    return (
      <div className="border rounded p-3 my-2">
        <div className="font-semibold mb-1">{title}</div>
        {keys.map((k) => (
          <Field
            key={k}
            path={[...path, k]}
            subschema={(subschema.properties as any)[k]}
            value={value?.[k]}
            onChange={(v: any) => onChange({ ...(value || {}), [k]: v })}
            errorsFor={errorsFor}
          />
        ))}
        <Err />
      </div>
    );
  }
  if (type === 'array') {
    const items = Array.isArray(value) ? value : [];
    return (
      <div className="border rounded p-3 my-2">
        <div className="font-semibold mb-1">{title}</div>
        {items.map((it: any, idx: number) => (
          <div className="flex items-center gap-2 py-1" key={idx}>
            <input
              className="border rounded flex-1 p-2"
              type="text"
              value={String(it)}
              onChange={(e) => {
                const next = items.slice();
                next[idx] = (e.target as HTMLInputElement).value;
                onChange(next);
              }}
            />
            <button
              className="border rounded px-2 py-1"
              onClick={() => onChange(items.filter((_: any, i: number) => i !== idx))}
            >
              -
            </button>
          </div>
        ))}
        <button
          className="mt-1 border rounded px-2 py-1"
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
  const sectionSchema = useMemo(() => {
    const fullSchema = {
      ...schema,
      type: 'object',
      properties: { [section]: (schema.properties || {})[section] },
    };
    return fullSchema;
  }, [schema, section]);

  const validate = useMemo(() => {
    try {
      // Register the full schema so $defs are available
      if ((schema as any).$defs || (schema as any).definitions) {
        const fullSchemaForDefs = {
          ...schema,
          $id: 'http://frigate.internal/schema',
        } as any;
        try {
          ajv.removeSchema('http://frigate.internal/schema');
        } catch {}
        ajv.addSchema(fullSchemaForDefs);
      }
      return ajv.compile(sectionSchema as any);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('SimpleRenderer validation setup failed:', err);
      return Object.assign(() => true, { errors: [] as any[] });
    }
  }, [sectionSchema, schema]);

  const errorMap = useMemo(() => {
    try {
      void (validate as any)(data);
      return buildErrorMap((validate as any).errors as any);
    } catch {
      return {} as Record<string, string[]>;
    }
  }, [validate, data]);

  const errorsFor = (pathArr: string[]) => getErrorsForPath(errorMap, pathArr);

  return (
    <div>
      <Field
        path={[section]}
        subschema={(schema.properties || {})[section]}
        value={data?.[section]}
        onChange={(next: any) => onChange({ [section]: next })}
        errorsFor={errorsFor}
      />
    </div>
  );
}
