import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { loadReadingTypographySettings } from './companionReadingTypographySettings';

const probe = vi.hoisted(() => vi.fn());
vi.mock('@/shared/typography/readingFontWeightProbe', async original => ({
  ...await original<typeof import('@/shared/typography/readingFontWeightProbe')>(), probeReadingFontWeights: probe
}));
vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <p>Reading body</p> }));

function article(nodeId = 'weight-first') {
  return <ImmersiveReadableArticle onExit={() => undefined} snapshot={null} readableArticle={{
    content: 'Reading body', hideTitleHeading: false, nodeId,
    persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [], title: nodeId
  }} />;
}
function openAppearance() {
  fireEvent.click(screen.getByText('Reading body'));
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
}
const value = () => screen.getByLabelText('Font weight');
const increase = () => screen.getByRole('button', { name: 'Increase Font weight' });
const decrease = () => screen.getByRole('button', { name: 'Decrease Font weight' });
const body = (container: HTMLElement) => container.querySelector('[data-reading-font-size]') as HTMLElement;

beforeEach(() => {
  window.localStorage.clear();
  probe.mockReset().mockResolvedValue([400, 450, 500, 700]);
});
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

it('adjusts the actual reader, keeps weight through another article and reopens from saved settings', async () => {
  const view = render(article());
  openAppearance();
  await waitFor(() => expect(increase()).toBeEnabled());
  expect(value()).toHaveTextContent('400');
  expect(screen.queryByRole('slider', { name: 'Font weight' })).not.toBeInTheDocument();
  expect(decrease()).toBeDisabled();
  fireEvent.click(increase());
  expect(body(view.container).style.getPropertyValue('--content-panel-font-weight')).toBe('450');
  expect(loadReadingTypographySettings().fontWeight).toBe(450);
  expect(probe).toHaveBeenCalledTimes(1);
  view.rerender(article('weight-second'));
  expect(body(view.container).style.getPropertyValue('--content-panel-font-weight')).toBe('450');
  view.unmount();
  const reopened = render(article('weight-second'));
  openAppearance();
  await waitFor(() => expect(increase()).toBeEnabled());
  expect(value()).toHaveTextContent('450');
  expect(body(reopened.container).style.getPropertyValue('--content-panel-font-weight')).toBe('450');
  expect(screen.queryByRole('button', { name: 'Reset font weight' })).not.toBeInTheDocument();
  fireEvent.click(decrease());
  expect(loadReadingTypographySettings().fontWeight).toBe(400);
});

it('resets only on a font change and ignores an obsolete detection result', async () => {
  let finish!: (weights: number[]) => void;
  probe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(article());
  openAppearance();
  await waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
  expect(increase()).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Serif' }));
  await waitFor(() => expect(increase()).toBeEnabled());
  fireEvent.click(increase());
  fireEvent.click(increase());
  await act(async () => finish([400]));
  expect(increase()).toBeEnabled();
  expect(value()).toHaveTextContent('500');
  fireEvent.click(screen.getByRole('button', { name: 'Sans' }));
  expect(loadReadingTypographySettings().fontWeight).toBe(400);
  expect(body(view.container).style.getPropertyValue('--content-panel-font-weight')).toBe('400');
});

it('disables unavailable steps, jumps between effective weights, and retries a failed detection', async () => {
  probe.mockResolvedValueOnce([400]);
  const view = render(article());
  openAppearance();
  await waitFor(() => expect(value()).toHaveAttribute('aria-busy', 'false'));
  expect(increase()).toBeDisabled();
  probe.mockRejectedValueOnce(new Error('measurement failed'));
  fireEvent.click(screen.getByRole('button', { name: 'Serif' }));
  await screen.findByRole('button', { name: 'Retry' });
  expect(increase()).toBeDisabled();
  probe.mockResolvedValueOnce([400, 700]);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(increase()).toBeEnabled());
  fireEvent.click(increase());
  expect(loadReadingTypographySettings().fontWeight).toBe(700);
  expect(increase()).toBeDisabled();
  expect(probe).toHaveBeenCalledTimes(3);
  fireEvent.click(decrease());
  expect(loadReadingTypographySettings().fontWeight).toBe(400);
  expect(body(view.container).style.getPropertyValue('--content-panel-font-weight')).toBe('400');
});

it('keeps confirmed weight and rendered text after a failed write, then saves a retry', async () => {
  const view = render(article());
  openAppearance();
  await waitFor(() => expect(increase()).toBeEnabled());
  fireEvent.click(increase());
  const storage = window.localStorage;
  const failure = vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    getItem: storage.getItem.bind(storage),
    setItem: () => { throw new Error('storage denied'); }
  } as Storage);
  fireEvent.click(increase());
  expect(screen.getByText(/Could not save reading settings/)).toHaveAttribute('role', 'alert');
  expect(value()).toHaveTextContent('450');
  expect(loadReadingTypographySettings().fontWeight).toBe(450);
  expect(body(view.container).style.getPropertyValue('--content-panel-font-weight')).toBe('450');
  failure.mockRestore();
  fireEvent.click(increase());
  expect(loadReadingTypographySettings().fontWeight).toBe(500);
  expect(screen.queryByText(/Could not save reading settings/)).not.toBeInTheDocument();
});
