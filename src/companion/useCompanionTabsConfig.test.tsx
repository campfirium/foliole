import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { normalizeCompanionTabConfig, useCompanionTabsConfig } from './useCompanionTabsConfig';

afterEach(() => {
  window.localStorage.clear();
});

describe('useCompanionTabsConfig', () => {
  it('normalizes stored config back to the default Directory-first tabs', () => {
    expect(normalizeCompanionTabConfig()).toEqual({
      orderedTabIds: ['shortcut', 'browse', 'learn', 'search', 'settings'],
      shortcut: { destinationId: 'directory', enabled: true }
    });
  });

  it('persists the default tab settings locally', () => {
    const { result } = renderHook(() => useCompanionTabsConfig());

    act(() => {
      result.current.setConfig();
    });

    expect(JSON.parse(window.localStorage.getItem('foliole-companion-tabs-config') ?? '{}')).toEqual({
      orderedTabIds: ['shortcut', 'browse', 'learn', 'search', 'settings'],
      shortcut: { destinationId: 'directory', enabled: true }
    });
  });
});
