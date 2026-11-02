import { useEffect, useState } from 'react';

import { probeReadingFontWeights } from '../../../shared/typography/readingFontWeightProbe';
import type { InterfaceFontPreset } from '../model/appearanceSettings';
import { resolveInterfaceFontFamily } from '../model/appearanceTypography';

export function useReadingFontWeights(preset: InterfaceFontPreset, custom: string, retry: number) {
  const family = resolveInterfaceFontFamily(preset, custom);
  const [result, setResult] = useState({ family: '', status: 'loading', weights: [400] });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ family, status: 'loading', weights: [400] });
    void probeReadingFontWeights(family, controller.signal).then((weights) => {
      if (!controller.signal.aborted) setResult({ family, status: 'ready', weights });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ family, status: 'error', weights: [400] });
    });
    return () => controller.abort();
  }, [family, retry]);
  return result.family === family ? result : { family, status: 'loading', weights: [400] };
}
