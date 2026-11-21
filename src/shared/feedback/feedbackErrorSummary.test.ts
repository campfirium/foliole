import { afterEach, expect, it, vi } from 'vitest';

import { loadRecentErrorSummary } from '../platform/diagnosticBundle';
import { getRuntimeInvoke } from '../platform/runtimeInvoke';

import { FEEDBACK_LIMITS } from './feedbackContract';
import { appendFeedbackErrorSummary, FEEDBACK_ERROR_SUMMARY_HEADING } from './feedbackErrorSummary';

vi.mock('../platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

const lines = (count: number) => ['Platform: darwin 25.6.0',
  ...Array.from({ length: count }, (_, index) => `- 2026-11-21T05:38:${String(index).padStart(2, '0')}.000Z error_${index} ${'x'.repeat(120)}`)
].join('\n');

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(getRuntimeInvoke).mockReset();
});

it('keeps the full user text and appends the summary after a separator', () => {
  const message = appendFeedbackErrorSummary('Import fails.', lines(2));
  expect(message).toBe(`Import fails.\n\n---\n${FEEDBACK_ERROR_SUMMARY_HEADING}\n${lines(2)}`);
});

it('drops the oldest summary lines so the message fits the feedback limit', () => {
  const userText = 'y'.repeat(3000);
  const message = appendFeedbackErrorSummary(userText, lines(10));

  expect(message.length).toBeLessThanOrEqual(FEEDBACK_LIMITS.messageLength);
  expect(message.startsWith(userText)).toBe(true);
  expect(message).toContain('error_9');
  expect(message).not.toContain('error_0 ');
});

it('sends the user text unchanged when there is no room or nothing to attach', () => {
  const fullText = 'z'.repeat(FEEDBACK_LIMITS.messageLength);
  expect(appendFeedbackErrorSummary(fullText, lines(3))).toBe(fullText);
  expect(appendFeedbackErrorSummary('Hi', null)).toBe('Hi');
  expect(appendFeedbackErrorSummary('Hi', 'Platform: darwin 25.6.0')).toBe('Hi');
});

it('requests only the error summary and gives up quietly on failure or timeout', async () => {
  const invoke = vi.fn().mockResolvedValueOnce({ report_text: lines(1), status: 'generated' })
    .mockRejectedValueOnce(new Error('ipc failed'))
    .mockReturnValueOnce(new Promise(() => undefined));
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(loadRecentErrorSummary()).resolves.toBe(lines(1));
  expect(invoke).toHaveBeenCalledWith('copy_diagnostic_report', { scope: 'errors' });
  await expect(loadRecentErrorSummary()).resolves.toBeNull();
  vi.useFakeTimers();
  const pending = loadRecentErrorSummary(1000);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(pending).resolves.toBeNull();
});
