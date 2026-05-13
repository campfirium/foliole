import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

import { useEditorScrollbarMetrics } from './markdownEditorScrollbar';

const getScrollMetrics = vi.fn(() => ({ clientHeight: 480, scrollHeight: 3200, scrollTop: 960 }));

beforeEach(() => {
  getScrollMetrics.mockClear();
});

describe('useEditorScrollbarMetrics', () => {
  it('does not trigger a rerender when syncing scroll metrics', () => {
    const lifecycle = { renders: 0 };
    const syncScrollMetricsRef: { current: (() => void) | null } = { current: null };

    function Harness() {
      lifecycle.renders += 1;
      const adapter = Object.assign(Object.create(CodeMirrorEditorAdapter.prototype) as CodeMirrorEditorAdapter, {
        getScrollMetrics
      });
      const adapterRef = useRef<CodeMirrorEditorAdapter | null>(adapter);
      syncScrollMetricsRef.current = useEditorScrollbarMetrics(adapterRef).syncScrollMetrics;
      return null;
    }

    render(<Harness />);

    expect(lifecycle.renders).toBe(1);

    act(() => {
      syncScrollMetricsRef.current?.();
    });

    expect(getScrollMetrics).toHaveBeenCalledTimes(1);
    expect(lifecycle.renders).toBe(1);
  });
});
