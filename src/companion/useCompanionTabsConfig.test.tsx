import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { normalizeCompanionTabConfig, useCompanionTabsConfig } from './useCompanionTabsConfig';

afterEach(() => {
  window.localStorage.clear();
});

describe('useCompanionTabsConfig', () => {
  it('normalizes invalid stored config back to the default four tabs plus shortcut slot', () => {
    expect(normalizeCompanionTabConfig({ orderedTabIds: ['browse'], shortcut: { destinationId: 'bad', enabled: true } })).toEqual({
      orderedTabIds: ['browse', 'learn', 'search', 'settings', 'shortcut'],
      shortcut: { destinationId: 'directory', enabled: true }
    });
  });

  it('persists shortcut tab settings locally', () => {
    const { result } = renderHook(() => useCompanionTabsConfig());

    act(() => {
      result.current.setConfig({
        orderedTabIds: ['browse', 'learn', 'search', 'settings', 'shortcut'],
        shortcut: { destinationId: 'sync', enabled: true }
      });
    });

    expect(JSON.parse(window.localStorage.getItem('foliole-companion-tabs-config') ?? '{}')).toEqual({
      orderedTabIds: ['browse', 'learn', 'search', 'settings', 'shortcut'],
      shortcut: { destinationId: 'sync', enabled: true }
    });
  });
});
