import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { CompanionReadingCustomFonts } from './CompanionReadingCustomFonts';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';

const fontsMock = vi.hoisted(() => ({
  importReadingFont: vi.fn(),
  listReadingFonts: vi.fn(),
  removeReadingFont: vi.fn()
}));

vi.mock('./companionReadingFonts', () => fontsMock);

beforeEach(() => {
  vi.clearAllMocks();
  fontsMock.listReadingFonts.mockResolvedValue([]);
});

it('selects an imported font only after it has been stored and loaded', async () => {
  const onChange = vi.fn();
  let finishImport!: (value: { id: string; name: string }) => void;
  fontsMock.importReadingFont.mockReturnValue(new Promise((resolve) => { finishImport = resolve; }));
  const { container } = render(
    <CompanionReadingCustomFonts onChange={onChange} settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />
  );
  const file = new File(['font'], 'Reader.otf', { type: 'font/otf' });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  expect(onChange).not.toHaveBeenCalled();
  finishImport({ id: '123', name: 'Reader' });
  await waitFor(() => expect(onChange).toHaveBeenCalledWith({
    ...DEFAULT_READING_TYPOGRAPHY_SETTINGS,
    fontFamily: 'custom:123'
  }));
  expect(screen.getByRole('button', { name: 'Reader' })).toBeInTheDocument();
});

it('keeps the current font when import fails', async () => {
  const onChange = vi.fn();
  fontsMock.importReadingFont.mockRejectedValue(new Error('invalid font'));
  const { container } = render(
    <CompanionReadingCustomFonts onChange={onChange} settings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} />
  );
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(['bad'], 'bad.ttf')] }
  });
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
