import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { CompanionCustomCssProvider } from './CompanionCustomCssProvider';
import { CompanionCustomCssSettingsContent } from './CompanionCustomCssSettingsContent';
import { COMPANION_CUSTOM_CSS_STORAGE_KEY } from './companionCustomCssStorage';

function renderSettings(runtimeKind: 'android-capacitor' | 'web-preview' = 'web-preview') {
  return render(
    <CompanionCustomCssProvider runtimeKind={runtimeKind}>
      <CompanionCustomCssSettingsContent />
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

describe('CompanionCustomCssSettingsContent', () => {
  it('shows the management surface on Android', () => {
    renderSettings('android-capacitor');

    expect(screen.getByText('Custom CSS snippets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add snippet' })).toBeInTheDocument();
  });

  it('adds, edits, saves, toggles, rejects invalid drafts, and deletes snippets', async () => {
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
