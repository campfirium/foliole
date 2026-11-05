import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { loadReadingTypographySettings } from './companionReadingTypographySettings';

vi.mock('@/features/settings/model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn(async () => ({ fonts: ['Reading Sans'], monospaceFonts: ['Device Mono'] }))
}));

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

function mount() {
  return render(<MouseGestureSettingsProvider><ImmersiveReadableArticle onExit={() => undefined} snapshot={null} readableArticle={{
    content: 'Reading prose\n\n`sample code`\n\n```js\nconst sample = true;\n```',
    hideTitleHeading: false, nodeId: 'mono-topic', persistedNodeViewState: null,
    pdfAttachmentId: null, textAnchorDecorations: [], title: 'Monospace settings'
  }} /></MouseGestureSettingsProvider>);
}

async function openAppearance() {
  await waitFor(() => expect(screen.getByText('Reading prose')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Reading prose'));
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
}

it('changes code font without altering prose, retains it on reentry and can return to default', async () => {
  const view = mount();
  await openAppearance();
  const body = view.container.querySelector('[data-reading-font-size]') as HTMLElement;
  const proseFont = body.style.getPropertyValue('--content-panel-font-family');
  expect(screen.getByRole('combobox', { name: 'Monospace font' })).toHaveValue('default');
  fireEvent.change(screen.getByRole('combobox', { name: 'Monospace font' }), { target: { value: 'fira' } });
  expect(body.style.getPropertyValue('--content-panel-mono-font-family')).toContain('Fira Code');
  expect(body.style.getPropertyValue('--content-panel-font-family')).toBe(proseFont);
  expect(loadReadingTypographySettings()).toMatchObject({ monospaceFont: 'fira', fontFamily: 'sans', fontSize: 16, fontWeight: 400 });
  await waitFor(() => expect(screen.getByRole('option', { name: 'Device Mono' })).toBeInTheDocument());
  fireEvent.change(screen.getByRole('combobox', { name: 'Monospace font' }), { target: { value: 'system:Device Mono' } });
  expect(body.style.getPropertyValue('--content-panel-mono-font-family')).toContain('Device Mono');
  view.unmount();
  const returned = mount();
  await openAppearance();
  expect(screen.getByRole('combobox', { name: 'Monospace font' })).toHaveValue('system:Device Mono');
  expect((returned.container.querySelector('[data-reading-font-size]') as HTMLElement).style.getPropertyValue('--content-panel-mono-font-family')).toContain('Device Mono');
  fireEvent.change(screen.getByRole('combobox', { name: 'Monospace font' }), { target: { value: 'default' } });
  expect(loadReadingTypographySettings().monospaceFont).toBeUndefined();
  expect(returned.container.querySelector('[data-reading-font-size]')).toHaveStyle({ '--content-panel-font-family': proseFont });
  await act(async () => undefined);
});

it('keeps confirmed code font on write failure and retries without changing body weight', async () => {
  const view = mount();
  await openAppearance();
  const select = screen.getByRole('combobox', { name: 'Monospace font' });
  fireEvent.change(select, { target: { value: 'consolas' } });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  fireEvent.change(select, { target: { value: 'fira' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings');
  expect(loadReadingTypographySettings().monospaceFont).toBe('consolas');
  expect(select).toHaveValue('consolas');
  expect(view.container.querySelector('[data-reading-font-size]')).toHaveStyle({ '--content-panel-font-weight': '400' });
  write.mockRestore();
  fireEvent.change(select, { target: { value: 'fira' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(loadReadingTypographySettings().monospaceFont).toBe('fira');
  await act(async () => undefined);
});
