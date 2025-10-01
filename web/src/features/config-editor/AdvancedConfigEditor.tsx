import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import * as YAML from 'yaml';
import { diffToParamPairs, chunkParamPairs } from './diffToQuery';
import { validateConfigGuards } from './clientGuards';
import SimpleRenderer from './SimpleRenderer';
import { ErrorBoundary } from './ErrorBoundary';
import { getFieldHelp } from './fieldHelp';
import type { ComponentType } from 'react';

type RJSFFormType = ComponentType<any> | null;
type ValidatorType = any;

const fetcher = (url: string) => axios.get(url, { withCredentials: true }).then((r) => r.data);

export default function AdvancedConfigEditor() {
  const { t } = useTranslation('views/settings');

  const { data: schema } = useSWR('config/schema.json', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const { data: config, mutate } = useSWR('config', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const { data: rawYaml, mutate: mutateRaw } = useSWR('config/raw', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  // lazy-load RJSF + validator with unmount guard
  const [RJSFForm, setRJSFForm] = useState<RJSFFormType>(null);
  const [rjsfValidator, setRjsfValidator] = useState<ValidatorType>(null);
  const [rjsfLoading, setRjsfLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    Promise.all([import('@rjsf/core'), import('@rjsf/validator-ajv8')])
      .then(([coreModule, validatorModule]) => {
        if (!mounted) return;
        setRJSFForm(() => coreModule.default as any);
        setRjsfValidator(() => validatorModule.default);
        setRjsfLoading(false);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('RJSF failed to load, using SimpleRenderer:', err);
        setRjsfLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const [formData, setFormData] = useState<any>();
  const [activeTab, setActiveTab] = useState<'form' | 'yaml'>('form');
  const [activeSection, setActiveSection] = useState<string>('cameras');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const pauseReval = useRef(false);

  // token to force YAML preview to refresh (after save or when tab opens)
  const [configUpdatedAt, setConfigUpdatedAt] = useState<number>(Date.now());

  useEffect(() => {
    if (config && !formData) setFormData(config);
  }, [config, formData]);

  useEffect(() => {
    if (activeTab === 'yaml') {
      setConfigUpdatedAt(Date.now());
      // Revalidate yaml to refresh preview
      mutateRaw();
    }
  }, [activeTab, mutateRaw]);

  const sections = useMemo(() => {
    const props = (schema?.properties || {}) as Record<string, any>;
    const keys = Object.keys(props);
    const pref = ['cameras', 'detectors', 'model', 'record', 'snapshots', 'mqtt', 'telemetry', 'ui'];
    const ordered = [...pref, ...keys.filter((k) => !pref.includes(k))].filter((k) => (props as any)[k]);

    // Capitalize common acronyms properly
    const formatLabel = (id: string) => {
      const acronyms: Record<string, string> = {
        'ui': 'UI',
        'mqtt': 'MQTT',
        'tls': 'TLS',
        'rtmp': 'RTMP',
        'rtsp': 'RTSP',
        'http': 'HTTP',
        'api': 'API',
        'ssl': 'SSL',
        'ffmpeg': 'FFmpeg',
        'genai': 'GenAI',
        'go2rtc': 'Go2RTC',
      };

      const translated = t(`config.sections.${id}`, { defaultValue: id });
      // If translation returned the ID (no translation found), apply formatting
      if (translated === id && acronyms[id.toLowerCase()]) {
        return acronyms[id.toLowerCase()];
      }
      // Capitalize first letter if it's just the raw ID
      if (translated === id) {
        return id.charAt(0).toUpperCase() + id.slice(1);
      }
      return translated;
    };

    return ordered.map((id) => ({ id, label: formatLabel(id) }));
  }, [schema, t]);

  const onSectionChange = useCallback(
    (e: any) => {
      const next = e.formData; // section-level form data
      setFormData((prev: any) => ({ ...prev, [activeSection]: next }));
      setUnsaved(true);
    },
    [activeSection],
  );

  const onSimpleChange = useCallback((patch: any) => {
    setFormData((prev: any) => {
      // Deep merge to avoid re-creating the entire object
      const updated = { ...prev };
      for (const key in patch) {
        updated[key] = patch[key];
      }
      return updated;
    });
    setUnsaved(true);
  }, []);

  const guard = useMemo(() => validateConfigGuards(formData || {}), [formData]);

  const saveChunks = useCallback(
    async (pairs: string[]) => {
      const chunks = chunkParamPairs(pairs);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const qs = chunk.join('&');
        console.log(`Save: Chunk ${i + 1}/${chunks.length}:`, qs);
        try {
          // Send empty body object when using query parameters
          const response = await axios.put(
            `config/set?${qs}`,
            {},
            { withCredentials: true, headers: { 'Content-Type': 'application/json' } }
          );
          console.log(`Save: Chunk ${i + 1} response:`, response.data);
        } catch (err: any) {
          console.error(`Save: Chunk ${i + 1} error:`, err.response?.data || err);
          const msg = err?.response?.data?.message || err?.message || 'Unknown error';
          // Include the parameters that failed in the error message for help detection
          const params = chunk.slice(0, 3).join(', '); // First 3 params
          const errorWithContext = `${msg}\nFailed parameters: ${params}${chunk.length > 3 ? '...' : ''}`;
          throw new Error(errorWithContext);
        }
      }
    },
    [],
  );

  const onSave = useCallback(async () => {
    if (!config || !formData) {
      console.log('Save: No config or formData');
      return;
    }
    const pairs = diffToParamPairs(config, formData);
    console.log('Save: Generated pairs:', pairs);
    if (!pairs.length) {
      console.log('Save: No changes detected');
      alert('No changes to save');
      setUnsaved(false);
      return;
    }
    setSaving(true);
    try {
      console.log('Save: Saving', pairs.length, 'changes...');
      await saveChunks(pairs);
      pauseReval.current = true;
      await mutate();
      setUnsaved(false);
      setConfigUpdatedAt(Date.now());
      await mutateRaw();

      // Show restart warning
      const restart = confirm(
        '✅ Configuration saved successfully!\n\n' +
        '⚠️ IMPORTANT: Frigate must be restarted for changes to take effect.\n\n' +
        'If you have more changes to make, you can restart later.\n' +
        'Otherwise, click OK to restart Frigate now, or Cancel to restart manually later.'
      );

      if (restart) {
        console.log('Save: User requested restart');
        try {
          await axios.post('restart', {}, { withCredentials: true });
          alert('Frigate is restarting... The page will reload in a few seconds.');
          setTimeout(() => window.location.reload(), 5000);
        } catch (err: any) {
          console.error('Save: Restart failed:', err);
          alert('Could not restart automatically. Please restart Frigate manually via Docker:\ndocker restart frigate');
        }
      }
    } catch (err: any) {
      console.error('Save: Error:', err);
      const msg = err?.response?.data?.message || err?.message || 'Unknown error';

      // Try to extract field path from error message and provide help
      let helpText = '';

      // Get the full error message which includes "Failed parameters: ..."
      const fullError = String(err?.message || msg);
      console.log('Full error for help detection:', fullError);

      // Extract field path from patterns like "model.attributes_map.person.2=car"
      const paramMatch = fullError.match(/([a-z_]+\.[a-z_]+(?:\.[a-z_]+)*)/i);
      console.log('Param match result:', paramMatch);

      if (paramMatch) {
        // Take first two or three segments for help lookup
        const segments = paramMatch[1].split('.');
        let fieldPath = segments.slice(0, Math.min(segments.length, 3));
        console.log('Field path for help lookup:', fieldPath);

        let help = getFieldHelp(fieldPath);
        // If no help found with 3 segments, try 2 segments
        if (!help && fieldPath.length > 2) {
          fieldPath = segments.slice(0, 2);
          console.log('Trying with 2 segments:', fieldPath);
          help = getFieldHelp(fieldPath);
        }

        console.log('Help found:', help);

        if (help) {
          helpText = `\n\n📘 HELP:\n${help.description}`;
          if (help.example) {
            helpText += `\n\nExample:\n${help.example}`;
          }
          if (help.docsUrl) {
            helpText += `\n\nDocs: ${help.docsUrl}`;
          }
        }
      }

      alert(`Save failed: ${msg}${helpText}\n\nCheck the browser console for details.`);
    } finally {
      setSaving(false);
      pauseReval.current = false;
    }
  }, [config, formData, mutate, mutateRaw, saveChunks]);

  // Build section schema with $defs injected (moved outside Content to avoid hooks violation)
  const rjsfSectionSchema = useMemo(() => {
    if (!schema) return null;
    const sectionSubschema = (schema.properties || {})[activeSection];
    if (!sectionSubschema) return null;
    const defs = (schema as any).$defs || (schema as any).definitions;
    return defs ? { ...sectionSubschema, $defs: defs } : sectionSubschema;
  }, [schema, activeSection]);

  const renderContent = useMemo(() => {
    if (!schema || !formData) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
    if (activeTab === 'form') {
      if (!rjsfSectionSchema) {
        return (
          <div className="p-4 text-sm text-muted-foreground">No schema available for section "{activeSection}".</div>
        );
      }

      // Use SimpleRenderer - it handles $refs properly
      // Key by section so it only remounts when section changes
      return (
        <SimpleRenderer
          key={activeSection}
          schema={schema}
          data={formData}
          onChange={onSimpleChange}
          section={activeSection}
        />
      );
    }

    // YAML tab - show current section's data only - EDITABLE
    const sectionData = formData?.[activeSection];
    let yamlText = '';
    try {
      if (sectionData !== undefined) {
        yamlText = YAML.stringify(sectionData);
      } else {
        yamlText = '# No data';
      }
    } catch (e: any) {
      yamlText = `# Error: ${e.message}`;
    }

    const handleYamlChange = (e: any) => {
      const newYaml = (e.target as HTMLTextAreaElement).value;
      try {
        const parsed = YAML.parse(newYaml);
        // Update formData with parsed YAML
        setFormData((prev: any) => ({ ...prev, [activeSection]: parsed }));
        setUnsaved(true);
      } catch (err) {
        // Invalid YAML - don't update, user is still typing
        console.log('YAML parse error (user still editing):', err);
      }
    };

    return (
      <div className="p-4 flex flex-col h-full">
        <div className="mb-2 text-sm text-muted-foreground">
          Edit <strong>{activeSection}</strong> section as YAML (changes update the form)
        </div>
        <textarea
          className="flex-1 text-xs md:text-sm p-3 bg-background text-foreground border rounded font-mono whitespace-pre overflow-auto"
          value={yamlText}
          onChange={handleYamlChange}
          spellCheck={false}
        />
      </div>
    );
  }, [schema, formData, activeTab, activeSection, rjsfSectionSchema, onSimpleChange]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className={`border-r bg-background_alt ${mobileMenuOpen ? 'block' : 'hidden'} md:flex w-56 shrink-0 flex-col h-full max-h-full`}>
        <div className="flex items-center justify-between p-2 md:hidden shrink-0">
          <div className="font-semibold">{t('config.title', { defaultValue: 'Configuration' })}</div>
          <button className="border rounded px-2 py-1" onClick={() => setMobileMenuOpen(false)}>Close</button>
        </div>
        <nav className="p-2 space-y-1 overflow-y-scroll flex-1">
          {sections.map((s) => (
            <button
              key={s.id}
              className={`w-full text-left px-2 py-1 rounded ${activeSection === s.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 p-2 border-b shrink-0">
          <button className="md:hidden border rounded px-2 py-1" onClick={() => setMobileMenuOpen((v) => !v)}>
            ☰
          </button>
          <div className="flex items-center gap-2">
            <button
              className={`border rounded px-2 py-1 ${activeTab === 'form' ? 'bg-muted' : ''}`}
              onClick={() => setActiveTab('form')}
            >
              Form
            </button>
            <button
              className={`border rounded px-2 py-1 ${activeTab === 'yaml' ? 'bg-muted' : ''}`}
              onClick={() => setActiveTab('yaml')}
            >
              YAML
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {unsaved && (
              <span className="text-xs text-amber-600">Unsaved changes</span>
            )}
            {guard.warnings.length > 0 && (
              <div className="text-xs text-amber-600">{guard.warnings.length} warning(s)</div>
            )}
            {guard.errors.length > 0 && (
              <div className="text-xs text-destructive">{guard.errors.length} error(s)</div>
            )}
            <button
              className={`rounded px-4 py-2 font-medium transition-colors ${
                saving
                  ? 'bg-blue-600 text-white cursor-wait'
                  : unsaved && guard.errors.length === 0
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
              disabled={saving || guard.errors.length > 0 || !unsaved}
              onClick={onSave}
            >
              {saving ? '⏳ Saving...' : unsaved ? '💾 Save Changes' : '✓ Saved'}
            </button>
          </div>
        </div>

        {/* Messages */}
        {guard.errors.length > 0 && (
          <div className="m-2 p-2 border border-destructive rounded text-destructive text-sm">
            {guard.errors.map((e, i) => (
              <div key={i}>• {e}</div>
            ))}
          </div>
        )}
        {guard.warnings.length > 0 && (
          <div className="m-2 p-2 border rounded text-amber-700 border-amber-300 text-sm bg-amber-50">
            {guard.warnings.map((w, i) => (
              <div key={i}>• {w}</div>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          {renderContent}
        </div>
      </div>
    </div>
  );
}
