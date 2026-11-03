import { fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ platform: 'android', fail: false, renders: 0 }));
vi.mock('@capacitor/core', async importOriginal => ({
  ...await importOriginal<typeof import('@capacitor/core')>(),
  Capacitor: { getPlatform: () => runtime.platform }
}));
vi.mock('../features/pdf/components/SimplePdfDocument', () => ({
  SimplePdfDocument: () => {
    runtime.renders++;
    if (runtime.fail) throw new SyntaxError('Invalid regular expression flags');
    return <p>PDF original viewer</p>;
  }
}));

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';

import { CompanionPersistedPdfDocument } from './CompanionPersistedPdfDocument';
import { CompanionSearchPdfDocument } from './CompanionSearchPdfDocument';

afterEach(() => { vi.restoreAllMocks(); runtime.platform = 'android'; runtime.fail = false; runtime.renders = 0; });

function original(attachmentId = 'pdf') {
  return <LocalizationProvider initialLanguagePreference="en"><Suspense fallback={null}>
    <CompanionPersistedPdfDocument attachmentId={attachmentId} title="PDF" />
  </Suspense></LocalizationProvider>;
}

it('keeps a PDF with no text local to an unsupported original without loading the viewer', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/108.0.5359.128');
  render(original());
  expect(screen.getByText(/Android System WebView component is too old/)).toBeInTheDocument();
  expect(screen.queryByText(/still read/)).not.toBeInTheDocument();
  expect(runtime.renders).toBe(0);
});

it('returns from a restricted search PDF without claiming an extracted topic exists', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/108.0.5359.128');
  const exit = vi.fn();
  render(<LocalizationProvider initialLanguagePreference="en">
    <CompanionSearchPdfDocument onExit={exit} result={{ attachment_id: 'pdf', page: 2 }} syncEndpointUrl={null} />
  </LocalizationProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(exit).toHaveBeenCalledOnce();
  expect(screen.queryByText(/still read/)).not.toBeInTheDocument();
  expect(runtime.renders).toBe(0);
});

it.each(['Chrome/125.0.0.0', 'Unknown browser'])('allows an eligible or unknown runtime to try its original (%s)', async ua => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  render(original());
  expect(await screen.findByText('PDF original viewer')).toBeInTheDocument();
});

it('contains a viewer failure and can display another document without blaming the system', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Unknown browser');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  runtime.fail = true;
  const view = render(original());
  expect(await screen.findByText('The original PDF could not be opened.')).toBeInTheDocument();
  expect(screen.queryByText(/WebView component is too old/)).not.toBeInTheDocument();
  runtime.fail = false;
  view.rerender(original('another'));
  expect(await screen.findByText('PDF original viewer')).toBeInTheDocument();
});

it('does not apply Android restrictions to iOS', async () => {
  runtime.platform = 'ios';
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome/108.0.0.0');
  render(original());
  expect(await screen.findByText('PDF original viewer')).toBeInTheDocument();
});
