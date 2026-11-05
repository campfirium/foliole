import { useEffect, useState } from 'react';

import { probeReadingFontWeights } from './readingFontWeightProbe';

export function useDetectedReadingFontWeights(family: string, retry: number, prepare?: () => Promise<void>) {
  const [result, setResult] = useState({ family: '', status: 'loading', weights: [400] });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ family, status: 'loading', weights: [400] });
    void Promise.resolve().then(prepare).then(() => {
      controller.signal.throwIfAborted();
      return probeReadingFontWeights(family, controller.signal);
    }).then((weights) => {
      if (!controller.signal.aborted) setResult({ family, status: 'ready', weights });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ family, status: 'error', weights: [400] });
    });
    return () => controller.abort();
  }, [family, retry, prepare]);
  return result.family === family ? result : { family, status: 'loading', weights: [400] };
}
