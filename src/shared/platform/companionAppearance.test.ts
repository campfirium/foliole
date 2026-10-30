import { beforeEach, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  kind: 'web-preview', setStyle: vi.fn(), setAppearance: vi.fn()
}));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({ setAppearance: host.setAppearance }),
  SystemBars: { setStyle: host.setStyle },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT' }
}));
vi.mock('./companionRuntimeCapabilities', () => ({
  getCompanionRuntimeCapability: () => ({ kind: host.kind })
}));

import { applyCompanionHostAppearance } from './companionAppearance';

beforeEach(() => { vi.clearAllMocks(); host.kind = 'web-preview'; });

it('does not request native system bars from a browser preview', async () => {
  await applyCompanionHostAppearance('dark', '#161918');
  expect(host.setStyle).not.toHaveBeenCalled();
});

it.each(['android-native', 'ios-native'])('sets readable system bars for both modes on %s', async (kind) => {
  host.kind = kind;
  await applyCompanionHostAppearance('dark', '#161918');
  await applyCompanionHostAppearance('light', '#ffffff');
  expect(host.setStyle.mock.calls).toEqual([[{ style: 'DARK' }], [{ style: 'LIGHT' }]]);
  expect(host.setAppearance.mock.calls).toEqual(kind === 'android-native'
    ? [[{ backgroundColor: '#161918' }], [{ backgroundColor: '#ffffff' }]] : []);
});

it('reports native failure instead of declaring system bars updated', async () => {
  host.kind = 'android-native';
  host.setStyle.mockRejectedValueOnce(new Error('Native failure'));
  await expect(applyCompanionHostAppearance('dark', '#161918')).rejects.toThrow('Native failure');
});
