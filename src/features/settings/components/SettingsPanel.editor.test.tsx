import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('edits the highlight annotation prefix from editor settings', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="editor" />);

  const input = screen.getByLabelText('Highlight annotation prefix');
  expect(input).toHaveValue('※ ');

  fireEvent.change(input, { target: { value: 'Note: ' } });

  expect(input).toHaveValue('Note: ');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.highlightAnnotationPrefix)).toBe('Note: ');

  fireEvent.click(screen.getByRole('button', { name: 'Reset highlight annotation prefix' }));

  expect(input).toHaveValue('※ ');
});

it('edits frontmatter meta fields from editor settings', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="editor" />);

  const input = screen.getByLabelText('Frontmatter meta fields');
  expect(input).toHaveValue('author|byline, url|link|source|source_url');

  fireEvent.change(input, { target: { value: 'aliases, source' } });

  expect(input).toHaveValue('aliases, source');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.frontmatterMetaFields)).toBe('aliases, source');

  fireEvent.click(screen.getByRole('button', { name: 'Reset frontmatter meta fields' }));

  expect(input).toHaveValue('author|byline, url|link|source|source_url');
});

it('edits the floating toolbar opacity and visibility from editor settings', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="editor" />);

  const opacity = screen.getByLabelText('Floating toolbar opacity');
  const toggle = screen.getByRole('switch', { name: 'Show floating toolbar' });

  expect(opacity).toHaveValue('100');
  expect(toggle).toHaveAttribute('aria-checked', 'true');

  fireEvent.change(opacity, { target: { value: '0' } });
  fireEvent.click(toggle);

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionToolbarOpacityPercent)).toBe('0');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionToolbarEnabled)).toBe('false');
  expect(toggle).toHaveAttribute('aria-checked', 'false');
});

it('lets readers disable double-click editing while keeping it enabled by default', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="editor" />);

  const toggle = screen.getByRole('switch', { name: 'Double-click body to edit' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.immersiveDoubleClickEditEnabled)).toBe('false');
});

it('does not expose the retired markdown syntax marker setting', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'visible');

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="editor" />);

  expect(screen.queryByText('Show markdown syntax markers')).not.toBeInTheDocument();
  expect(screen.queryByRole('radiogroup', { name: 'Markdown syntax visibility' })).not.toBeInTheDocument();
});

it('edits the long cloze front guard mode from editor settings', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="editor" />);

  expect(screen.getByRole('radio', { name: 'Remind' })).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(screen.getByRole('radio', { name: 'Convert' }));

  expect(screen.getByRole('radio', { name: 'Convert' })).toHaveAttribute('aria-checked', 'true');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardMode)).toBe('convert');

  const selectionLimit = screen.getByLabelText('Cloze guard selected text limit');
  const frontLimit = screen.getByLabelText('Cloze guard front length limit');
  expect(selectionLimit).toHaveValue(20);
  expect(frontLimit).toHaveValue(500);

  fireEvent.change(selectionLimit, { target: { value: '0' } });
  fireEvent.change(frontLimit, { target: { value: '800' } });

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardSelectionMin)).toBe('0');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardFrontMax)).toBe('800');
});
