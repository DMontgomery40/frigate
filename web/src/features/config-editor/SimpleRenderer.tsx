import React, { useMemo } from 'react';
import Ajv from 'ajv';

type Props = { schema: any; data: any; onChange: (next: any)=>void; section: string };

const ajv = new Ajv({ allErrors: true, coerceTypes: true, useDefaults: true });

// Convert Ajv instancePath "/a/b/0/c" to "a.b.0.c"
const ptrToDot = (p: string) => p.replace(/^\//,'').replace(/\//g,'.');

function buildErrorMap(errors: any[]|null|undefined): Record<string,string[]> {
  const out: Record<string,string[]> = {};
  (errors || []).forEach(err => {
    const key = ptrToDot(err.instancePath || '');
    const msg = err.message || 'Invalid value';
    if (!out[key]) out[key] = [];
    out[key].push(msg);
  });
  return out;
}

function Field({ path, subschema, value, onChange, errorsFor }: any) {
  const type = subschema?.type;
  const title = subschema?.title || path[path.length-1];
  const desc = subschema?.description;
  const errs = errorsFor(path);
  const Err = () => errs.length ? (<div className="text-xs text-destructive mt-1">{errs.join('; ')}</div>) : null;

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
        <input className="border rounded w-full p-2" type="number" value={value ?? ''} onChange={e => onChange((e.target as HTMLInputElement).valueAsNumber)} />
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
          <select className="border rounded w-full p-2" value={value ?? ''} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
            <option value=""></option>
            {subschema.enum.map((v: any) => <option key={String(v)} value={v}>{String(v)}</option>)}
          </select>
          {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
          <Err />
        </label>
      );
    }

    return (
      <label className="block py-1">
        <span className="font-medium">{title}</span>
        <input className="border rounded w-full p-2" type="text" value={value ?? ''} onChange={e => onChange((e.target as HTMLInputElement).value)} />
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
        {keys.map(k => (
          <Field key={k}
                 path={[...path, k]}
                 subschema={(subschema.properties as any)[k]}
                 value={value?.[k]}
                 onChange={(v: any) => onChange({ ...(value||{}), [k]: v })}
                 errorsFor={errorsFor} />
        ))}
      </div>
    );
  }

  if (type === 'array') {
    const items = Array.isArray(value) ? value : [];
    // shallow array editor (fallback limitation)
    return (
      <div className="border rounded p-3 my-2">
        <div className="font-semibold mb-1">{title}</div>
        {items.map((it: any, idx: number) => (
          <div className="flex items-center gap-2 py-1" key={idx}>
            <input className="border rounded flex-1 p-2" type="text" value={String(it)}
                   onChange={e => {
                     const next = items.slice();
                     next[idx] = (e.target as HTMLInputElement).value;
                     onChange(next);
                   }} />
            <button className="border rounded px-2 py-1"
                    onClick={() => onChange(items.filter((_: any, i: number) => i!==idx))}>-</button>
          </div>
        ))}
        <button className="mt-1 border rounded px-2 py-1" onClick={() => onChange([...(items||[]), ''])}>+ Add</button>
      </div>
    );
  }

  return <div className="text-xs text-muted-foreground">Unsupported field: {title}</div>;
}

export default function SimpleRenderer({ schema, data, onChange, section }: Props) {
  const sectionSchema = useMemo(() => ({
    type: 'object',
    properties: { [section]: (schema.properties||{})[section] }
  }), [schema, section]);

  const validate = useMemo(() => ajv.compile(sectionSchema), [sectionSchema]);
  const errorMap = useMemo(() => {
    // Run validation to populate errors; ignore boolean result
    void validate(data);
    return buildErrorMap(validate.errors as any);
  }, [validate, data]);

  const errorsFor = (path: string[]) => errorMap[path.join('.') ] || [];

  return (
    <div>
      <Field
        path={[section]}
        subschema={(schema.properties || {})[section]}
        value={data?.[section]}
        onChange={(v: any) => onChange({ ...(data||{}), [section]: v })}
        errorsFor={errorsFor}
      />
    </div>
  );
}

