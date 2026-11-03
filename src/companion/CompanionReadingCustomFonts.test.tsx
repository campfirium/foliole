import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { CompanionReadingCustomFonts } from './CompanionReadingCustomFonts';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';

const fontsMock = vi.hoisted(() => ({
  activateReadingFont: vi.fn(), commitReadingFonts: vi.fn(), prepareReadingFonts: vi.fn(),
  listReadingFonts: vi.fn(), removeReadingFont: vi.fn()
}));
vi.mock('./companionReadingFonts', async importOriginal => ({
  ...await importOriginal<typeof import('./companionReadingFonts')>(), ...fontsMock
}));
const face = { id: 'face', style: 'normal' as const, weightMin: 400, weightMax: 400, stretch: 'normal' };
const family = { id: '123', name: 'Reader', faces: [face] };
const prepared = { records: [{ id: '123', name: 'Reader', data: new ArrayBuffer(1), face }], expected: new Map() };

beforeEach(() => {
  vi.clearAllMocks();
  fontsMock.listReadingFonts.mockResolvedValue([]);
  fontsMock.prepareReadingFonts.mockResolvedValue(prepared);
  fontsMock.activateReadingFont.mockResolvedValue(true);
});

function upload(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(['font'], 'Reader.otf', { type: 'font/otf' })] }
  });
}

it('selects an imported font only after confirmation, storage and loading', async () => {
  const onChange = vi.fn();
  let finishImport!: (value: typeof family[]) => void;
  fontsMock.commitReadingFonts.mockReturnValue(new Promise(resolve => { finishImport = resolve; }));
  const { container } = render(<CompanionReadingCustomFonts onChange={onChange}
    settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />);
  upload(container);
  fireEvent.click(await screen.findByRole('button', { name: 'Add fonts' }));
  expect(onChange).not.toHaveBeenCalled();
  fontsMock.listReadingFonts.mockResolvedValue([family]);
  finishImport([family]);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith({
    ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, fontFamily: 'custom:123'
  }));
  expect(screen.getByRole('button', { name: 'Reader' })).toBeInTheDocument();
});

it('keeps the current font when import fails', async () => {
  const onChange = vi.fn();
  fontsMock.prepareReadingFonts.mockRejectedValue(new Error('invalid font'));
  const { container } = render(<CompanionReadingCustomFonts onChange={onChange}
    settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />);
  upload(container);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it('does not write or select when a preview is cancelled', async () => {
  const onChange = vi.fn();
  const { container } = render(<CompanionReadingCustomFonts onChange={onChange}
    settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />);
  upload(container);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(fontsMock.commitReadingFonts).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

it('does not remove selected font bytes when the default selection cannot be saved', async () => {
  fontsMock.listReadingFonts.mockResolvedValue([family]);
  const onChange = vi.fn(() => false);
  render(<CompanionReadingCustomFonts onChange={onChange}
    settings={{ ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, fontFamily: 'custom:123' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Reader' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(fontsMock.removeReadingFont).not.toHaveBeenCalled();
});

it('does not change selection if a stored family cannot load', async () => {
  fontsMock.listReadingFonts.mockResolvedValue([family]);
  fontsMock.activateReadingFont.mockRejectedValue(new Error('bad font'));
  const onChange = vi.fn();
  render(<CompanionReadingCustomFonts onChange={onChange} settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reader' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it('keeps a newer font choice when an earlier stored font finishes loading', async () => {
  fontsMock.listReadingFonts.mockResolvedValue([family]);
  let finish!: (loaded: boolean) => void;
  fontsMock.activateReadingFont.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const onChange = vi.fn();
  const view = render(<CompanionReadingCustomFonts onChange={onChange}
    settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reader' }));
  view.rerender(<CompanionReadingCustomFonts onChange={onChange}
    settings={{ ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, fontFamily: 'serif' }} />);
  finish(true);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reader' })).toBeEnabled());
  expect(onChange).not.toHaveBeenCalled();
});

it('keeps a newer font choice when an import finishes saving', async () => {
  let finish!: (fonts: typeof family[]) => void;
  fontsMock.commitReadingFonts.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const onChange = vi.fn();
  const view = render(<CompanionReadingCustomFonts onChange={onChange}
    settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />);
  upload(view.container);
  fireEvent.click(await screen.findByRole('button', { name: 'Add fonts' }));
  view.rerender(<CompanionReadingCustomFonts onChange={onChange}
    settings={{ ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, fontFamily: 'serif' }} />);
  fontsMock.listReadingFonts.mockResolvedValue([family]);
  finish([family]);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Add fonts' })).not.toBeInTheDocument());
  expect(onChange).not.toHaveBeenCalled();
});
