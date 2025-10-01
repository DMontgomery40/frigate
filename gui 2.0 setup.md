 here’s the FULL, clean, end-to-end build with the last set of fixes applied:



❌ Removed the unreliable rollback (no /config/save restore attempts)

✅ Chunked saves with clear error reporting (which chunk failed)

✅ Mobile hamburger menu (toggle sidebar on small screens)

✅ Client guards are non-blocking warnings (you can “save anyway”)

✅ Keys & values encoded in query params; YAML preview refreshes after save & on tab open

✅ Preact + dynamic RJSF (safe lazy import w/ unmount guard), i18n wired

✅ Fallback SimpleRenderer with inline Ajv validation

Run this one command to install deps and write all files:





echo "== ADVANCED CONFIG EDITOR - FULL, CORRECT BUILD ==" && \

WEB_DIR=~/frigate/web && \cd "$WEB_DIR" && \

npm i axios @rjsf/core @rjsf/validator-ajv8 ajv yaml && \mkdir -p src/features/config-editor public/locales/en/views && \# 1) diffToQuery.ts — deep diff → dot paths; encode keys & values; chunkingcat > src/features/config-editor/diffToQuery.ts <<'EOF'type J = any;

const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);function flatten(obj: any, prefix = ''): Record<string, string | number | boolean | null | undefined | Array<any>> {

const out: Record<string, any> = {};

if (Array.isArray(obj)) {

obj.forEach((v, i) => Object.assign(out, flatten(v, `${prefix}${prefix ? '.' : ''}${i}`)));

} else if (isObj(obj)) {

for (const [k, v] of Object.entries(obj)) {

Object.assign(out, flatten(v, `${prefix}${prefix ? '.' : ''}${k}`));

}

} else {

out[prefix] = obj;

}

return out;

}



// conservative URL budget to avoid 414 at proxies (nginx ~8KB; we keep it small)

const URL_BUDGET = 3500;function serializeValue(v: any): string | undefined {

if (Array.isArray(v) && v.every(n => typeof n === 'number')) return v.join(',');

if (typeof v === 'boolean') return v ? 'true' : 'false';

if (v === undefined) return undefined; // skip undefined to avoid accidental deletes

if (v === null) return ''; // allow explicit empty string when null

return String(v);

}export function diffToParamPairs(original: J, edited: J): string[] {

const a = flatten(original);

const b = flatten(edited);

const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

const pairs: string[] = [];



for (const k of keys) {

const vOld = a[k];

const vNew = b[k];

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

}export function chunkParamPairs(pairs: string[]): string[][] {

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

EOF# 2) clientGuards.ts — non-blocking warnings (only block truly invalid top-level structure)cat > src/features/config-editor/clientGuards.ts <<'EOF'export type GuardResult = { warnings: string[]; errors: string[] };



/** Non-blocking guard rails: warn for typical pitfalls, only block fatal structure issues. */export function validateConfigGuards(cfg: any): GuardResult {

const warnings: string[] = [];

const errors: string[] = [];



const cams = cfg?.cameras;

// Fatal: cameras must be a map (name -> camera)

if (Array.isArray(cams)) {

errors.push(`"cameras" must be an object map of camera names, not an array.`);

return { warnings, errors };

}



if (cams && typeof cams === 'object') {

for (const [name, cam] of Object.entries<any>(cams)) {

const inputs = cam?.ffmpeg?.inputs;

const roleSet = new Set<string>();



if (Array.isArray(inputs)) {

for (const inp of inputs) {

const roles = Array.isArray(inp?.roles) ? inp.roles.map((r: any) => String(r)) : [];

roles.forEach((r: string) => roleSet.add(r));

}

}



// Warnings (non-blocking): enabled features missing expected roles

if (cam?.detect?.enabled && !roleSet.has('detect')) {

warnings.push(`Camera "${name}": detect.enabled is true, but no ffmpeg input has role "detect".`);

}

if (cam?.record?.enabled && !roleSet.has('record')) {

warnings.push(`Camera "${name}": record.enabled is true, but no ffmpeg input has role "record".`);

}

if (cam?.rtmp?.enabled && !roleSet.has('rtmp')) {

warnings.push(`Camera "${name}": rtmp.enabled is true, but no ffmpeg input has role "rtmp".`);

}



// Warn if detect dimensions are present but invalid

const w = cam?.detect?.width;

const h = cam?.detect?.height;

if (w !== undefined && (!Number.isInteger(w) || w <= 0)) {

warnings.push(`Camera "${name}": detect.width should be a positive integer.`);

}

if (h !== undefined && (!Number.isInteger(h) || h <= 0)) {

warnings.push(`Camera "${name}": detect.height should be a positive integer.`);

}

}

}



return { warnings, errors };

}

EOF# 3) ErrorBoundary.tsx — contained crashescat > src/features/config-editor/ErrorBoundary.tsx <<'EOF'

import { Component, type ComponentChild } from 'preact';type Props = { fallback: ComponentChild; children: ComponentChild };type State = { hasError: boolean };export class ErrorBoundary extends Component<Props, State> {

state: State = { hasError: false };

static getDerivedStateFromError() { return { hasError: true }; }

componentDidCatch(err: any) { console.error('ConfigEditor crashed:', err); }

render() { return this.state.hasError ? this.props.fallback : this.props.children; }

}

EOF# 4) SimpleRenderer.tsx — fallback renderer with inline Ajv errorscat > src/features/config-editor/SimpleRenderer.tsx <<'EOF'

import { useMemo } from 'preact/hooks';

import Ajv from 'ajv';type Props = { schema: any; data: any; onChange: (next: any)=>void; section: string };



const ajv = new Ajv({ allErrors: true, coerceTypes: true, useDefaults: true });



// Convert Ajv instancePath "/a/b/0/c" to "a.b.0.c"

const ptrToDot = (p: string) => p.replace(/^\//,'').replace(/\//g,'.');function buildErrorMap(errors: any[]|null|undefined): Record<string,string[]> {

const out: Record<string,string[]> = {};

(errors || []).forEach(err => {

const key = ptrToDot(err.instancePath || '');

const msg = err.message || 'Invalid value';

if (!out[key]) out[key] = [];

out[key].push(msg);

});

return out;

}function getErrorsForPath(map: Record<string,string[]>, path: string[]): string[] {

const key = path.join('.');

return map[key] || [];

}function Field({ path, subschema, value, onChange, errorsFor }: any) {

const type = subschema?.type;

const title = subschema?.title || path[path.length-1];

const desc = subschema?.description;

const errs = errorsFor(path);

const Err = () => errs.length ? (<div class="text-xs text-destructive mt-1">{errs.join('; ')}</div>) : null;



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

<input class="border rounded w-full p-2"

type="number"

value={value ?? ''}

onChange={e => onChange((e.target as HTMLInputElement).valueAsNumber)} />

{desc && <div class="text-xs text-muted-foreground">{desc}</div>}

<Err />

</label>

);

}

if (type === 'string') {

if (subschema.enum) {

return (

<label class="block py-1">

<span class="font-medium">{title}</span>

<select class="border rounded w-full p-2"

value={value ?? ''}

onChange={e => onChange((e.target as HTMLSelectElement).value)}>

<option value=""></option>

{subschema.enum.map((v: any) => <option key={String(v)} value={v}>{String(v)}</option>)}

</select>

{desc && <div class="text-xs text-muted-foreground">{desc}</div>}

<Err />

</label>

);

}

return (

<label class="block py-1">

<span class="font-medium">{title}</span>

<input class="border rounded w-full p-2"

type="text"

value={value ?? ''}

onChange={e => onChange((e.target as HTMLInputElement).value)} />

{desc && <div class="text-xs text-muted-foreground">{desc}</div>}

<Err />

</label>

);

}

if (type === 'object' && subschema.properties) {

const keys = Object.keys(subschema.properties);

return (

<div class="border rounded p-3 my-2">

<div class="font-semibold mb-1">{title}</div>

{keys.map(k => (

<Field key={k}

path={[...path, k]}

subschema={(subschema.properties as any)[k]}

value={value?.[k]}

onChange={(v: any) => onChange({ ...(value||{}), [k]: v })}

errorsFor={errorsFor} />

))}

<Err />

</div>

);

}

if (type === 'array') {

const items = Array.isArray(value) ? value : [];

// shallow array editor (fallback limitation)

return (

<div class="border rounded p-3 my-2">

<div class="font-semibold mb-1">{title}</div>

{items.map((it: any, idx: number) => (

<div class="flex items-center gap-2 py-1" key={idx}>

<input class="border rounded flex-1 p-2"

type="text"

value={String(it)}

onChange={e => {

const next = items.slice();

next[idx] = (e.target as HTMLInputElement).value;

onChange(next);

}} />

<button class="border rounded px-2 py-1"

onClick={() => onChange(items.filter((_: any, i: number) => i!==idx))}>-</button>

</div>

))}

<button class="mt-1 border rounded px-2 py-1" onClick={() => onChange([...(items||[]), ''])}>+ Add</button>

{desc && <div class="text-xs text-muted-foreground">{desc}</div>}

<Err />

</div>

);

}

return <div class="text-xs text-muted-foreground">Unsupported field: {title}</div>;

}export default function SimpleRenderer({ schema, data, onChange, section }: Props) {

const sectionSchema = useMemo(() => ({

type: 'object',

properties: { [section]: (schema.properties||{})[section] }

}), [schema, section]);



const validate = useMemo(() => ajv.compile(sectionSchema), [sectionSchema]);

const errorMap = useMemo(() => {

const ok = validate(data);

return buildErrorMap(validate.errors);

}, [validate, data]);



const errorsFor = (pathArr: string[]) => getErrorsForPath(errorMap, pathArr);



return (

<div>

<Field path={[section]}

subschema={(schema.properties||{})[section]}

value={data?.[section]}

onChange={(next: any) => onChange({ [section]: next })}

errorsFor={errorsFor} />

</div>

);

}

EOF



# 5) YamlPreview.tsx — refresh on token + live formData preview

cat > src/features/config-editor/YamlPreview.tsx <<'EOF'

import { useEffect, useState } from 'preact/hooks';

import YAML from 'yaml';

import axios from 'axios';



type Props = { formData: any; refreshToken: number };



export default function YamlPreview({ formData, refreshToken }: Props) {

const [raw, setRaw] = useState<string>('loading...');

const [synthetic, setSynthetic] = useState<string>('');



// re-fetch raw YAML whenever refreshToken changes (after save or tab open)

useEffect(() => {

let ignore = false;

axios.get('/api/config/raw', { withCredentials: true })

.then(r => { if (!ignore) setRaw(r.data); })

.catch(e => { if (!ignore) setRaw('# error loading raw yaml: ' + (e?.message||e)); });

return () => { ignore = true; };

}, [refreshToken]);



// render preview from current form data

useEffect(() => {

try { setSynthetic(YAML.stringify(formData)); }

catch (e: any) { setSynthetic('# error rendering preview: ' + (e?.message||e)); }

}, [formData]);



return (

<div class="grid gap-4 md:grid-cols-2">

<div>

<h3 class="font-semibold mb-2">Current config.yml (read-only)</h3>

<pre class="bg-muted p-3 rounded overflow-auto max-h-[50vh] whitespace-pre-wrap text-xs">{raw}</pre>

</div>

<div>

<h3 class="font-semibold mb-2">Preview from form data</h3>

<pre class="bg-muted p-3 rounded overflow-auto max-h-[50vh] whitespace-pre-wrap text-xs">{synthetic}</pre>

</div>

</div>

);

}

EOF# 6) editor.css — dyslexic font (scoped)cat > src/features/config-editor/editor.css <<'EOF'

@font-face {

font-family: 'OpenDyslexic';

src: url('/fonts/OpenDyslexic-Regular.woff2') format('woff2');

font-weight: normal; font-style: normal;

}#config-editor-root.dyslexic-font, #config-editor-root.dyslexic-font * {

font-family: 'OpenDyslexic', system-ui, -apple-system, Segoe UI, Roboto, sans-serif !important;

letter-spacing: 0.02em; line-height: 1.55;

}

EOF# 7) AdvancedConfigEditor.tsx — main component (dynamic RJSF, i18n, chunk save, mobile hamburger, no rollback)cat > src/features/config-editor/AdvancedConfigEditor.tsx <<'EOF'

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { ErrorBoundary } from './ErrorBoundary';

import { diffToParamPairs, chunkParamPairs } from './diffToQuery';

import YamlPreview from './YamlPreview';

import SimpleRenderer from './SimpleRenderer';

import useSWR from 'swr';

import axios from 'axios';

import './editor.css';

import { useTranslation } from 'react-i18next';

import { validateConfigGuards } from './clientGuards';



const fetcher = (url: string) => axios.get(url, { withCredentials: true }).then(r => r.data);export default function AdvancedConfigEditor() {

const { t } = useTranslation('views/settings');



const { data: schema } = useSWR('/api/config/schema.json', fetcher, {

revalidateOnFocus: false, revalidateOnReconnect: false

});

const { data: config, mutate } = useSWR('/api/config', fetcher, {

revalidateOnFocus: false, revalidateOnReconnect: false

});



// lazy-load RJSF + validator with unmount guard

const [RJSFForm, setRJSFForm] = useState<any>(null);

const [rjsfValidator, setRjsfValidator] = useState<any>(null);

const [rjsfLoading, setRjsfLoading] = useState(true);

useEffect(() => {

let mounted = true;

Promise.all([import('@rjsf/core'), import('@rjsf/validator-ajv8')])

.then(([coreModule, validatorModule]) => {

if (!mounted) return;

setRJSFForm(() => coreModule.default);

setRjsfValidator(() => validatorModule.default);

setRjsfLoading(false);

})

.catch((err) => {

console.warn('RJSF failed to load, using SimpleRenderer:', err);

setRjsfLoading(false);

});

return () => { mounted = false; };

}, []);



const [formData, setFormData] = useState<any>();

const [activeTab, setActiveTab] = useState<'form'|'yaml'>('form');

const [activeSection, setActiveSection] = useState<string>('cameras');

const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

const [unsaved, setUnsaved] = useState(false);

const [saving, setSaving] = useState(false);

const pauseReval = useRef(false);



// token to force YAML preview to refresh (after save or when tab opens)

const [configUpdatedAt, setConfigUpdatedAt] = useState<number>(Date.now());



useEffect(() => { if (config && !formData) setFormData(config); }, [config, formData]);

useEffect(() => { if (activeTab === 'yaml') setConfigUpdatedAt(Date.now()); }, [activeTab]);



const sections = useMemo(() => {

const props = (schema?.properties||{}) as Record<string, any>;

const keys = Object.keys(props);

const pref = ['cameras','detectors','model','record','snapshots','mqtt','telemetry','ui'];

const ordered = [...pref, ...keys.filter(k => !pref.includes(k))].filter(k => props[k]);

return ordered.map(id => ({ id, label: t(`config.sections.${id}`, { defaultValue: id }) }));

}, [schema, t]);



const onSectionChange = useCallback((e:any) => {

const next = e.formData?.[activeSection];

setFormData((prev:any) => ({ ...prev, [activeSection]: next }));

setUnsaved(true);

}, [activeSection]);



const onSimpleChange = useCallback((patch:any) => {

setFormData((prev:any) => ({ ...prev, ...patch }));

setUnsaved(true);

}, []);



const onSave = useCallback(async () => {

if (!config || !formData) return;

setSaving(true);

pauseReval.current = true;

try {

// client-side guardrails: warn, only block fatal structure issues

const { warnings, errors } = validateConfigGuards(formData);

if (errors.length) {

const title = t('config.guards.title') || 'Please fix these items before saving';

alert(title + '\n\n' + errors.map(e => `• ${e}`).join('\n'));

setSaving(false);

pauseReval.current = false;

return;

}

if (warnings.length) {

const ok = window.confirm(

(t('config.guards.title') || 'Please fix these items before saving') +

'\n\n' + warnings.map(w => `• ${w}`).join('\n') +

'\n\n' + (t('config.guards.confirm') || 'Proceed and save anyway?')

);

if (!ok) { setSaving(false); pauseReval.current = false; return; }

}



const pairs = diffToParamPairs(config, formData);

if (pairs.length === 0) { setUnsaved(false); setSaving(false); return; }



const chunks = chunkParamPairs(pairs);

let failedIndex: number | null = null;



for (let i = 0; i < chunks.length; i++) {

const qs = chunks[i].join('&');

try {

await axios.put(`/api/config/set?${qs}`, { requires_restart: 0 }, {

headers: { 'Content-Type': 'application/json' }, withCredentials: true

});

} catch (err:any) {

failedIndex = i;

const status = err?.response?.status;

const note = status === 414

? ' (request too large; try fewer changes at once)'

: '';

alert(`Save failed at chunk ${i+1}/${chunks.length}${note}. Some earlier changes may have been applied. Check YAML/Logs.`);

break;

}

}



await mutate(); // refresh processed config

setConfigUpdatedAt(Date.now()); // force raw YAML refresh



if (failedIndex === null) {

alert(t('config.save.success') || 'Configuration saved');

setUnsaved(false);

}

} catch (e:any) {

const msg = e?.response?.data?.message || e?.message || 'unknown error';

alert((t('config.save.error', { message: msg }) || `Failed to save: ${msg}`) + '\nCheck server logs.');

} finally {

setSaving(false);

pauseReval.current = false;

}

}, [config, formData, mutate, t]);



if (!schema || !formData) return <div class="p-4">{t('loading') || 'Loading…'}</div>;

if (rjsfLoading) return <div class="p-4">{t('config.loading_form') || 'Loading form library…'}</div>;



const sectionSchema = useMemo(() => ({

type: 'object',

properties: { [activeSection]: (schema.properties||{})[activeSection] }

}), [schema, activeSection]);



const sectionData = useMemo(() => ({

[activeSection]: formData?.[activeSection]

}), [formData, activeSection]);



const useRJSF = RJSFForm && rjsfValidator;



return (

<ErrorBoundary fallback={<div class="p-4 text-destructive">{t('config.editor_error') || 'The configuration editor encountered an error.'}</div>}>

<div id="config-editor-root" class="flex flex-col h-full">

{/* Header */}

<div class="flex items-center justify-between border-b p-3">

<div class="flex items-center gap-2">

{/* Mobile hamburger */}

<button type="button" class="md:hidden p-2 border rounded mr-1"

onClick={() => setMobileMenuOpen(v => !v)} aria-label="Open menu">☰</button>

<h2 class="text-xl md:text-2xl font-semibold">{t('config.advanced_editor.title') || 'Advanced Configuration Editor'}</h2>

<span class="text-xs px-2 py-0.5 rounded bg-secondary">{t('config.beta_badge') || 'beta'}</span>

</div>

<div class="flex items-center gap-2">

<button type="button" class="border rounded px-3 py-1 hover:bg-secondary"

onClick={() => document.getElementById('config-editor-root')?.classList.toggle('dyslexic-font')}>

{t('config.dyslexic_font.label') || 'Dyslexic Font'}

</button>

<button type="button"

class={`rounded px-3 py-1 ${unsaved ? 'bg-primary text-primary-foreground' : 'bg-muted cursor-not-allowed'}`}

disabled={!unsaved || saving}

onClick={onSave}>

{saving ? (t('config.save.saving') || 'Saving…') : (t('config.save.cta') || 'Save')}

</button>

</div>

</div>



{/* Tabs */}

<div class="flex border-b px-3 gap-2">

<button class={`px-3 py-1 rounded ${activeTab==='form' ? 'bg-secondary' : 'hover:bg-muted'}`} onClick={() => setActiveTab('form')}>

{t('config.tabs.form') || 'Form'}

</button>

<button class={`px-3 py-1 rounded ${activeTab==='yaml' ? 'bg-secondary' : 'hover:bg-muted'}`} onClick={() => setActiveTab('yaml')}>

{t('config.tabs.yaml_preview') || 'YAML Preview'}

</button>

</div>



{/* Mobile slideout nav */}

<div class={`md:hidden ${mobileMenuOpen ? 'block' : 'hidden'} absolute inset-0 z-50`}>

<div class="absolute inset-0 bg-black/40" onClick={()=>setMobileMenuOpen(false)} />

<aside class="absolute left-0 top-0 bottom-0 w-64 bg-background border-r p-3 overflow-y-auto">

<nav class="space-y-1">

{sections.map(s => (

<button key={s.id}

class={`w-full text-left px-2 py-1 rounded ${activeSection===s.id ? 'bg-secondary' : 'hover:bg-muted'}`}

onClick={()=>{ setActiveSection(s.id); setMobileMenuOpen(false); }}>

{s.label}

</button>

))}

</nav>

</aside>

</div>



{activeTab === 'yaml' ? (

<div class="p-3">

<YamlPreview formData={formData} refreshToken={configUpdatedAt} />

</div>

) : (

<div class="flex flex-1 overflow-hidden">

{/* desktop side nav */}

<aside class="hidden md:block w-64 shrink-0 border-r overflow-y-auto p-3">

<nav class="space-y-1">

{sections.map(s => (

<button key={s.id}

class={`w-full text-left px-2 py-1 rounded transition-colors ${activeSection===s.id ? 'bg-secondary font-medium' : 'hover:bg-muted'}`}

onClick={() => setActiveSection(s.id)}>

{s.label}

</button>

))}

</nav>

</aside>

{/* content */}

<main class="flex-1 overflow-auto p-3">

{useRJSF ? (

<RJSFForm

schema={sectionSchema}

formData={sectionData}

validator={rjsfValidator}

showErrorList={true}

onChange={onSectionChange}

/>

) : (

<SimpleRenderer

schema={schema}

data={sectionData}

section={activeSection}

onChange={onSimpleChange}

/>

)}

</main>

</div>

)}

</div>

</ErrorBoundary>

);

}

EOF# 8) i18n keys — merge minimal keys (use jq if available, else create/overwrite)if command -v jq >/dev/null 2>&1; then

TMP_A=/tmp/_vs_settings.json

TMP_B=/tmp/_cfg_keys.json

if [ -f public/locales/en/views/settings.json ]; then

cp public/locales/en/views/settings.json "$TMP_A"

else

echo '{}' > "$TMP_A"

fi

cat > "$TMP_B" <<'JSON'

{

"config": {

"advanced_editor": { "title": "Advanced Configuration Editor" },

"tabs": { "form": "Form", "yaml_preview": "YAML Preview" },

"save": { "cta": "Save", "saving": "Saving…", "success": "Configuration saved", "error": "Failed to save configuration: {{message}}" },

"editor_error": "The configuration editor encountered an error.",

"dyslexic_font": { "label": "Dyslexic Font", "tooltip": "Use a dyslexia-friendly font in this editor" },

"guards": { "title": "Please fix these items before saving", "confirm": "Proceed and save anyway?" },

"beta_badge": "beta",

"loading_form": "Loading form library…",

"sections": {

"cameras": "Cameras", "detectors": "Detectors", "model": "Model",

"record": "Recording", "snapshots": "Snapshots", "mqtt": "MQTT",

"telemetry": "Telemetry", "ui": "UI"

}

}

}

JSON

jq -s '.[0] * .[1]' "$TMP_A" "$TMP_B" > public/locales/en/views/settings.json && rm -f "$TMP_A" "$TMP_B"else

cat > public/locales/en/views/settings.json <<'JSON'

{

"config": {

"advanced_editor": { "title": "Advanced Configuration Editor" },

"tabs": { "form": "Form", "yaml_preview": "YAML Preview" },

"save": { "cta": "Save", "saving": "Saving…", "success": "Configuration saved", "error": "Failed to save configuration: {{message}}" },

"editor_error": "The configuration editor encountered an error.",

"dyslexic_font": { "label": "Dyslexic Font", "tooltip": "Use a dyslexia-friendly font in this editor" },

"guards": { "title": "Please fix these items before saving", "confirm": "Proceed and save anyway?" },

"beta_badge": "beta",

"loading_form": "Loading form library…",

"sections": {

"cameras": "Cameras", "detectors": "Detectors", "model": "Model",

"record": "Recording", "snapshots": "Snapshots", "mqtt": "MQTT",

"telemetry": "Telemetry", "ui": "UI"

}

}

}

JSONfi && \echo "== FILES WRITTEN. Next: verify preact/compat aliases in vite.config.ts and add a route ==" && \echo "vite.config.ts must alias react/react-dom to preact/compat. Then add a route to render AdvancedConfigEditor under Settings → Advanced." && \echo "Run: npm run dev"

Route & nav (manual, quick)

Add a route to mount the editor (keep it opt-in, not default):





// Example (adjust to your routing):import AdvancedConfigEditor from '@/features/config-editor/AdvancedConfigEditor';<Route path="/settings/advanced-config" element={<AdvancedConfigEditor />} />

And add a Settings menu item pointing to /settings/advanced-config.

Why this now aligns with your latest concerns

No rollback: we removed the broken restore; we report exact chunk index on failure so users can verify.

Mobile UX: hamburger button + overlay + mobile sidebar implemented; desktop sidebar unchanged.

Guards softened: only fatal shape issues block; everything else is a warning with a “Save anyway?” confirm.

Standards: keys & values encoded; dynamic RJSF import guarded; i18n wired; YAML preview refreshes after save and on tab-open.

If you want me to wire the Settings route in your exact repo layout, tell me the paths of your routes/nav files and I’ll spit out the precise patch.

