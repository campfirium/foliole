import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';

import { READWISE_ORIGINAL_FILE_LOADED_EVENT } from './readwiseBookActionState';
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

beforeEach(() => {
  vi.clearAllMocks();
});

async function primeCachedNodeDetails() {
  const request = createDeferred<RuntimeNodeSourceDetails | null>();
  const details = createPdfDetails('node-pdf');
  loadRuntimeNodeSourceDetails.mockImplementationOnce(() => request.promise);
  const { result, rerender } = renderHook(({ nodeId }: { nodeId: string | null }) => useNodeSourceDetails(nodeId), {
    initialProps: { nodeId: 'node-pdf' }
  });
  expect(result.current.isLoading).toBe(true);
  expect(result.current.value).toBeNull();
  await act(async () => {
    request.resolve(details);
  });
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
    expect(result.current.value).toEqual(details);
  });
  return { details, result, rerender };
}

it('reuses cached node details immediately when revisiting the same node', async () => {
  const secondRequest = createDeferred<RuntimeNodeSourceDetails | null>();
  const { details, result, rerender } = await primeCachedNodeDetails();
  loadRuntimeNodeSourceDetails.mockImplementationOnce(() => secondRequest.promise);

  rerender({ nodeId: null });
  expect(result.current).toEqual({ errorMessage: '', isLoading: false, retry: expect.any(Function), value: null });

  rerender({ nodeId: 'node-pdf' });

  expect(result.current.isLoading).toBe(false);
  expect(result.current.value).toEqual(details);

  await act(async () => {
    secondRequest.resolve(details);
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
      retry: expect.any(Function),
      value: null
    });
  });
});

it('refreshes node source details after a readwise original file is loaded', async () => {
  const initialDetails = createPdfDetails('node-source');
  const refreshedDetails = {
    ...createPdfDetails('node-source'),
    importSource: {
      ...createPdfDetails('node-source').importSource!,
      sourceLocator: '/tmp/refreshed.pdf'
    }
  };
  loadRuntimeNodeSourceDetails.mockResolvedValueOnce(initialDetails).mockResolvedValueOnce(refreshedDetails);

  const { result } = renderHook(() => useNodeSourceDetails('node-source'));

  await waitFor(() => expect(result.current.value).toEqual(initialDetails));

  act(() => {
    window.dispatchEvent(new CustomEvent(READWISE_ORIGINAL_FILE_LOADED_EVENT, { detail: { nodeId: 'node-source' } }));
  });

  await waitFor(() => expect(result.current.value).toEqual(refreshedDetails));
  expect(loadRuntimeNodeSourceDetails).toHaveBeenCalledTimes(2);
});
