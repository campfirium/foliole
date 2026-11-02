import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({ listAvailableSystemFonts: vi.fn(async () => ({ fonts: [], monospaceFonts: [] })) }));
beforeEach(() => window.localStorage.clear());

it('previews reading changes and returns to the same mounted panel and controls', () => {
  const onClose = vi.fn();
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} onClose={onClose} requestedCategory="typography" />);
  const dialog = screen.getByLabelText('Settings dialog');
  const size = screen.getByLabelText('Interface font size');
  fireEvent.change(size, { target: { value: '19' } });
  fireEvent.change(screen.getByLabelText('Line height'), { target: { value: '1.85' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(dialog).toHaveAttribute('inert');
  expect(document.documentElement.style.getPropertyValue('--content-panel-font-size')).toBe('19px');
  fireEvent.pointerDown(window);
  expect(dialog).not.toHaveAttribute('inert');
  expect(screen.getByLabelText('Settings dialog')).toBe(dialog);
  expect(screen.getByLabelText('Interface font size')).toBe(size);
  expect(size).toHaveValue('19');
  expect(screen.getByLabelText('Line height')).toHaveValue('1.85');
  expect(onClose).not.toHaveBeenCalled();
});

it.each(['Enter', 'Escape', ' '])('consumes %j to restore preview without activating the old focused control', (key) => {
  const onClose = vi.fn();
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} onClose={onClose} requestedCategory="typography" />);
  const preview = screen.getByRole('button', { name: 'Preview' });
  const activate = vi.fn();
  preview.addEventListener('keydown', activate);
  fireEvent.click(preview);
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  fireEvent(preview, event);
  expect(event.defaultPrevented).toBe(true);
  expect(activate).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Settings dialog')).not.toHaveAttribute('inert');
  expect(onClose).not.toHaveBeenCalled();
});
