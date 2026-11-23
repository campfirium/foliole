import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { chatGptQuestionUrl } from './companionAskChatGpt';
import { CompanionSelectionMoreMenu } from './CompanionSelectionMoreMenu';

afterEach(() => { vi.restoreAllMocks(); });

it('prefills the selected text as a ChatGPT question', () => {
  expect(chatGptQuestionUrl('  serendipity\n& luck ')).toBe('https://chatgpt.com/?q=serendipity%20%26%20luck');
  expect(chatGptQuestionUrl(' \n ')).toBeNull();
});

it('clips long selections by character without splitting surrogate pairs', () => {
  const url = chatGptQuestionUrl('😀'.repeat(2000));
  expect(decodeURIComponent(url!.split('?q=')[1]!)).toBe('😀'.repeat(1500));
});

it('opens ChatGPT from the selection more menu and closes it', () => {
  const opened: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { opened.push(this); });
  const onAsked = vi.fn();
  render(<CompanionSelectionMoreMenu rect={new DOMRect(10, 10, 50, 20)} text="ephemeral" onCopied={() => {}} onAskedChatGpt={onAsked} />);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ask ChatGPT' }));
  expect(opened.map(link => link.href)).toEqual(['https://chatgpt.com/?q=ephemeral']);
  expect(onAsked).toHaveBeenCalledTimes(1);
});
