import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CompanionCustomCssSettingsContent } from '../shared/customCss/CompanionCustomCssSettingsContent';

import { CompanionCustomCssProvider, useCompanionCustomCss } from './CompanionCustomCssProvider';
import { COMPANION_CUSTOM_CSS_STORAGE_KEY } from './companionCustomCssStorage';

function SnippetSettings() {
  return <CompanionCustomCssSettingsContent controller={useCompanionCustomCss()} />;
}

function renderSettings(runtimeKind: 'android-capacitor' | 'web-preview' = 'web-preview') {
  return render(
    <CompanionCustomCssProvider runtimeKind={runtimeKind}>
      <SnippetSettings />
    </CompanionCustomCssProvider>
  );
}

function customStyleNode() {
  return document.head.querySelector<HTMLStyleElement>('style[data-companion-custom-css="true"]');
}

async function addSnippet(name = 'Readable', sourceCss = 'p { color: red; }') {
  fireEvent.click(screen.getByRole('button', { name: 'Add snippet' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: name } });
  fireEvent.change(screen.getByRole('textbox', { name: 'CSS' }), { target: { value: sourceCss } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
}

beforeEach(() => {
  window.localStorage.clear();
  document.head.querySelectorAll('style[data-companion-custom-css]').forEach((node) => node.remove());
});

it('opens a disabled example, applies its edited heading color, and remembers deletion', async () => {
  const first = renderSettings();
  expect(screen.getByText('CSS Example')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Enable' })).toHaveAttribute('aria-checked', 'false');
  expect(customStyleNode()?.textContent).toBe('');

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const css = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'CSS' });
  expect(css.value).toContain('Level 1 heading (#)');
  expect(css.value).toContain('.cm-line-h1');
  fireEvent.change(css, { target: { value: css.value.replace('color: #4f7fd1', 'color: #336699') } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(customStyleNode()?.textContent).toBe('');

  fireEvent.click(screen.getByRole('switch', { name: 'Enable' }));
  await waitFor(() => expect(customStyleNode()?.textContent).toContain('.cm-line-h1'));
  expect(customStyleNode()?.textContent).toContain('.cm-line-h1 { color: #336699; }');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  const dialog = screen.getAllByRole('dialog').at(-1)!;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete snippet' }));
  await screen.findByText('No custom styles yet.');
  first.unmount();

  renderSettings();
  expect(screen.getByText('No custom styles yet.')).toBeInTheDocument();
  expect(customStyleNode()?.textContent).toBe('');
});

describe('CompanionCustomCssSettingsContent', () => {
  it('shows the management surface on Android', () => {
    renderSettings('android-capacitor');

    expect(screen.getByText('Custom CSS snippets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add snippet' })).toBeInTheDocument();
  });

  it('adds, edits, saves, toggles, rejects invalid drafts, and deletes snippets', async () => {
    window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, '{"snippets":[],"version":1}');
    renderSettings();
    await addSnippet();

    expect(customStyleNode()?.textContent).toContain('[data-companion-readable-document="true"] p');
    fireEvent.click(screen.getByRole('switch', { name: 'Disable' }));
    await waitFor(() => expect(screen.getByText('Off')).toBeInTheDocument());
    expect(customStyleNode()?.textContent).toBe('');

    fireEvent.click(screen.getByRole('switch', { name: 'Enable' }));
    await waitFor(() => expect(screen.getByText('On')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'CSS' }), { target: { value: 'h1 { color: blue; }' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(customStyleNode()?.textContent).toContain('h1'));

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'CSS' }), {
      target: { value: '@media screen { p { color: black; } }' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the name and CSS');
    expect(customStyleNode()?.textContent).toContain('h1');
    expect(customStyleNode()?.textContent).not.toContain('@media');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirmDialog = screen.getAllByRole('dialog').at(-1)!;
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete snippet' }));
    await waitFor(() => expect(screen.getByText('No custom styles yet.')).toBeInTheDocument());
    expect(customStyleNode()?.textContent).toBe('');
  });

  it('requires confirmation before resetting a corrupted saved collection', async () => {
    window.localStorage.setItem(COMPANION_CUSTOM_CSS_STORAGE_KEY, JSON.stringify({ snippets: [], version: 2 }));
    renderSettings();

    expect(screen.getByRole('alert')).toHaveTextContent('could not be read safely');
    expect(screen.getByRole('button', { name: 'Add snippet' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset styles' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset styles' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(JSON.parse(window.localStorage.getItem(COMPANION_CUSTOM_CSS_STORAGE_KEY)!)).toEqual({
      snippets: [],
      version: 1
    });
  });

  it('resets a valid saved collection only after confirmation', async () => {
    renderSettings();
    await addSnippet();

    fireEvent.click(screen.getByRole('button', { name: 'Reset styles' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset styles' }));

    await waitFor(() => expect(screen.getByText('No custom styles yet.')).toBeInTheDocument());
    expect(customStyleNode()?.textContent).toBe('');
  });
});
