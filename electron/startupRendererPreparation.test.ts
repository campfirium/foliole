// @vitest-environment node
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writePrebuiltRendererHtmlForSettings: vi.fn()
}));

vi.mock('./runtimeRendererHtml.js', () => ({
  writePrebuiltRendererHtmlForSettings: mocks.writePrebuiltRendererHtmlForSettings
}));

it('does not rebuild the startup renderer html during app startup', async () => {
  const { prepareStartupRendererAppearance } = await import('./startupRendererPreparation.js');

  expect(prepareStartupRendererAppearance('/runtime', '/userData')).toBeNull();
  expect(mocks.writePrebuiltRendererHtmlForSettings).not.toHaveBeenCalled();
});

it('prebuilds the startup renderer html only when settings are saved', async () => {
  const { writeStartupRendererHtml } = await import('./startupRendererPreparation.js');

  writeStartupRendererHtml('/runtime', { 'foliole-base-color': 'dark' }, '/userData');

  expect(mocks.writePrebuiltRendererHtmlForSettings).toHaveBeenCalledWith(
    '/runtime',
    { 'foliole-base-color': 'dark' },
    process.env.ELECTRON_RENDERER_URL ?? null,
    '/userData'
  );
});
