import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';

import { useNodeSourceDetails } from './useNodeSourceDetails';

const { loadRuntimeNodeSourceDetails } = vi.hoisted(() => ({
  loadRuntimeNodeSourceDetails: vi.fn()
}));

vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({
  loadRuntimeNodeSourceDetails
}));

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createPdfDetails(nodeId: string): RuntimeNodeSourceDetails {
  return {
    importRuns: [],
    importSource: {
      firstImportedAt: '2026-04-05T00:00:00.000Z',
      lastContentFingerprint: 'fp-1',
      lastImportedAt: '2026-04-05T00:00:00.000Z',
      latestNodeId: nodeId,
      provider: 'desktop_text_file',
      sourceFingerprint: 'source-fp-1',
      sourceKind: 'pdf',
      sourceLocator: `/tmp/${nodeId}.pdf`,
      sourceName: `${nodeId}.pdf`
    },
    inheritedFromParent: false,
    keepImportItem: null,
    pdfPageDimensions: [],
    sourceNodeId: nodeId
  };
}

describe('useNodeSourceDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses cached node details immediately when revisiting the same node', async () => {
    const firstRequest = createDeferred<RuntimeNodeSourceDetails | null>();
    const secondRequest = createDeferred<RuntimeNodeSourceDetails | null>();
    const cachedDetails = createPdfDetails('node-pdf');

    loadRuntimeNodeSourceDetails.mockImplementationOnce(() => firstRequest.promise).mockImplementationOnce(() => secondRequest.promise);

    const initialProps: { nodeId: string | null } = { nodeId: 'node-pdf' };
    const { result, rerender } = renderHook(({ nodeId }: { nodeId: string | null }) => useNodeSourceDetails(nodeId), {
      initialProps
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.value).toBeNull();

    await act(async () => {
      firstRequest.resolve(cachedDetails);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.value).toEqual(cachedDetails);
    });

    rerender({ nodeId: null });
    expect(result.current).toEqual({ errorMessage: '', isLoading: false, value: null });

    rerender({ nodeId: 'node-pdf' });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.value).toEqual(cachedDetails);

    await act(async () => {
      secondRequest.resolve(cachedDetails);
    });

    await waitFor(() => expect(loadRuntimeNodeSourceDetails).toHaveBeenCalledTimes(2));
  });

  it('exposes a load error without turning it into an empty source state', async () => {
    loadRuntimeNodeSourceDetails.mockRejectedValue(new Error('source unavailable'));

    const { result } = renderHook(() => useNodeSourceDetails('node-source'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current).toEqual({
        errorMessage: 'Source info could not be loaded.',
        isLoading: false,
        value: null
      });
    });
  });
});
