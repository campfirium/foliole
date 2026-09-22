import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { measurePdfTextLayerCropBox } from '../model/pdfAutoCrop';

import { useSimplePdfCropMeasurement } from './useSimplePdfCropMeasurement';

vi.mock('../model/pdfAutoCrop', () => ({ measurePdfTextLayerCropBox: vi.fn() }));
const crop = { bottom: 100, left: 0, right: 100, top: 0 };

function setup() {
  const props = {
    cropBox: null, onCropBoxChange: vi.fn(), onLayoutReady: vi.fn(), pageNumber: 1,
    pageRef: { current: document.createElement('div') }, width: 300
  };
  return { ...renderHook(useSimplePdfCropMeasurement, { initialProps: props }), props };
}

beforeEach(() => { vi.useFakeTimers(); vi.mocked(measurePdfTextLayerCropBox).mockReset(); });
afterEach(() => { vi.useRealTimers(); });

it('publishes a measured crop before reporting layout readiness', () => {
  vi.mocked(measurePdfTextLayerCropBox).mockReturnValue(crop);
  const { result, props } = setup();
  act(() => { result.current(); vi.advanceTimersByTime(16); });
  expect(props.onCropBoxChange).toHaveBeenCalledWith(crop);
  expect(props.onLayoutReady).toHaveBeenCalledTimes(1);
  expect(props.onCropBoxChange.mock.invocationCallOrder[0]).toBeLessThan(props.onLayoutReady.mock.invocationCallOrder[0]!);
});

it('keeps the existing one-frame measurement and 80ms retry policy', () => {
  vi.mocked(measurePdfTextLayerCropBox).mockReturnValueOnce(null).mockReturnValueOnce(crop);
  const { result, props } = setup();
  act(() => { result.current(); vi.advanceTimersByTime(16); });
  expect(props.onCropBoxChange).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(79); });
  expect(props.onCropBoxChange).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(1); });
  expect(props.onCropBoxChange).toHaveBeenCalledExactlyOnceWith(crop);
});

it('cancels a pending frame when the page unmounts', () => {
  const { result, unmount, props } = setup();
  act(() => { result.current(); });
  unmount();
  act(() => { vi.runAllTimers(); });
  expect(measurePdfTextLayerCropBox).not.toHaveBeenCalled();
  expect(props.onLayoutReady).not.toHaveBeenCalled();
});

it.each(['width', 'pageNumber'] as const)('cancels the retry and rejects old callbacks when %s changes', (field) => {
  vi.mocked(measurePdfTextLayerCropBox).mockReturnValue(null);
  const { result, rerender, props } = setup();
  const oldCallback = result.current;
  act(() => { oldCallback(); vi.advanceTimersByTime(16); });
  rerender({ ...props, [field]: props[field] + 1 });
  act(() => { oldCallback(); vi.runAllTimers(); });
  expect(measurePdfTextLayerCropBox).toHaveBeenCalledTimes(1);
  expect(props.onCropBoxChange).not.toHaveBeenCalled();
  expect(props.onLayoutReady).not.toHaveBeenCalled();
  vi.mocked(measurePdfTextLayerCropBox).mockReturnValue(crop);
  act(() => { result.current(); vi.advanceTimersByTime(16); });
  expect(props.onCropBoxChange).toHaveBeenCalledExactlyOnceWith(crop);
});

it('cancels the retry when the page unmounts', () => {
  vi.mocked(measurePdfTextLayerCropBox).mockReturnValue(null);
  const { result, unmount, props } = setup();
  act(() => { result.current(); vi.advanceTimersByTime(16); });
  unmount();
  act(() => { vi.runAllTimers(); });
  expect(measurePdfTextLayerCropBox).toHaveBeenCalledTimes(1);
  expect(props.onCropBoxChange).not.toHaveBeenCalled();
});
