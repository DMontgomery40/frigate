import React, { useEffect } from 'react';
import AdvancedConfigEditor from '@/features/config-editor/AdvancedConfigEditor';
import Heading from '@/components/ui/heading';
import { useTranslation } from 'react-i18next';

export default function AdvancedConfigEditorPage() {
  const { t } = useTranslation(['views/configEditor']);

  useEffect(() => {
    document.title = t('documentTitle');
  }, [t]);

  return (
    <div className="absolute bottom-2 left-0 right-0 top-2 md:left-2">
      <div className="relative flex h-full flex-col overflow-hidden">
        <div className="mr-1 flex items-center justify-between shrink-0">
          <div>
            <Heading as="h2" className="mb-0 ml-1 md:ml-0">
              Advanced Config Editor (beta)
            </Heading>
          </div>
        </div>
        <div className="mt-2 flex-1 border rounded bg-background overflow-hidden min-h-0">
          <AdvancedConfigEditor />
        </div>
      </div>
    </div>
  );
}

