import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { diffToParamPairs, chunkParamPairs } from './diffToQuery';
import { validateConfigGuards } from './clientGuards';
import SimpleRenderer from './SimpleRenderer';
import { ErrorBoundary } from './ErrorBoundary';

type RJSFFormType = React.ComponentType<any> | null;
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
    return ordered.map((id) => ({ id, label: t(`config.sections.${id}`, { defaultValue: id }) }));
  }, [schema, t]);

  const onSectionChange = useCallback(
    (e: any) => {
      const next = e.formData?.[activeSection];
      setFormData((prev: any) => ({ ...prev, [activeSection]: next }));
      setUnsaved(true);
    },
    [activeSection],
  );

  const onSimpleChange = useCallback((patch: any) => {
    setFormData((prev: any) => ({ ...prev, ...patch }));
    setUnsaved(true);
  }, []);

  const guard = useMemo(() => validateConfigGuards(formData || {}), [formData]);

  const saveChunks = useCallback(
    async (pairs: string[]) => {
      const chunks = chunkParamPairs(pairs);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const qs = chunk.join('&');
        try {
          await axios.put(`config/set?${qs}`);
        } catch (err: any) {
          const msg = err?.response?.data?.message || err?.message || 'Unknown error';
          throw new Error(`Chunk ${i + 1}/${chunks.length} failed: ${msg}`);
        }
      }
    },
    [],
  );

  const onSave = useCallback(async () => {
    if (!config || !formData) return;
    const pairs = diffToParamPairs(config, formData);
    if (!pairs.length) {
      setUnsaved(false);
      return;
    }
    setSaving(true);
    try {
      await saveChunks(pairs);
      pauseReval.current = true;
      await mutate();
      setUnsaved(false);
      setConfigUpdatedAt(Date.now());
      await mutateRaw();
    } finally {
      setSaving(false);
      pauseReval.current = false;
    }
  }, [config, formData, mutate, mutateRaw, saveChunks]);

  const Content = () => {
    if (!schema || !formData) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
    if (RJSFForm && rjsfValidator && activeTab === 'form') {
      const sectionSchema = {
        type: 'object',
        properties: { [activeSection]: (schema.properties || {})[activeSection] },
      };
      return (
        <ErrorBoundary fallback={<div className="p-4 text-sm text-destructive">Editor crashed. Try another section.</div>}>
          <RJSFForm
            schema={sectionSchema}
            validator={rjsfValidator}
            formData={formData}
            onChange={onSectionChange}
            uiSchema={{}}
            liveValidate={false}
          >
            <div />
          </RJSFForm>
        </ErrorBoundary>
      );
    }
    if (activeTab === 'form') {
      return (
        <SimpleRenderer schema={schema} data={formData} onChange={onSimpleChange} section={activeSection} />
      );
    }
    return (
      <pre className="text-xs md:text-sm p-3 overflow-auto bg-background_alt border rounded h-full whitespace-pre-wrap">{rawYaml || ''}</pre>
    );
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className={`border-r bg-background_alt ${mobileMenuOpen ? 'block' : 'hidden'} md:block w-56 shrink-0`}>
        <div className="flex items-center justify-between p-2 md:hidden">
          <div className="font-semibold">{t('config.title', { defaultValue: 'Configuration' })}</div>
          <button className="border rounded px-2 py-1" onClick={() => setMobileMenuOpen(false)}>Close</button>
        </div>
        <nav className="p-2 space-y-1">
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
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 p-2 border-b">
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
            {guard.warnings.length > 0 && (
              <div className="text-xs text-amber-600">{guard.warnings.length} warning(s)</div>
            )}
            {guard.errors.length > 0 && (
              <div className="text-xs text-destructive">{guard.errors.length} error(s)</div>
            )}
            <button
              className="border rounded px-3 py-1 disabled:opacity-60"
              disabled={saving || (!unsaved && guard.errors.length === 0)}
              onClick={onSave}
            >
              {saving ? 'Saving…' : 'Save'}
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

        <div className="flex-1 min-h-0">
          <Content />
        </div>
      </div>
    </div>
  );
}
