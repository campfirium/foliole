import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderToolbarVisibilityHarness, setScrollTopAndScroll } from './PdfDocumentViewport.toolbarVisibility.testSupport';

function advance(milliseconds = 3000) {
  act(() => vi.advanceTimersByTime(milliseconds));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('hides after upward scrolling stops and resets the idle delay on further scroll', async () => {
  const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();
  vi.useFakeTimers();
  setScrollTopAndScroll(scrollContainer, 300);
  setScrollTopAndScroll(scrollContainer, 360);
  setScrollTopAndScroll(scrollContainer, 300);
  advance(2000);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  setScrollTopAndScroll(scrollContainer, 280);
  advance(2000);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  advance(1000);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
});

it('reveals from the top edge and keeps keyboard focus protected after the pointer leaves', async () => {
  const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();
  vi.useFakeTimers();
  setScrollTopAndScroll(scrollContainer, 300);
  setScrollTopAndScroll(scrollContainer, 360);
  fireEvent.mouseEnter(screen.getByTestId('pdf-toolbar-reveal-zone'));
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  advance(5000);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  const input = screen.getByLabelText('PDF page');
  fireEvent.focus(input);
  fireEvent.mouseLeave(screen.getByTestId('pdf-toolbar-reveal-zone'));
  advance(5000);
  setScrollTopAndScroll(scrollContainer, 400);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.blur(input);
  advance();
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
});

it('protects an open zoom menu even without hover or focus, then resumes the idle delay', async () => {
  const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();
  vi.useFakeTimers();
  setScrollTopAndScroll(scrollContainer, 300);
  fireEvent.click(screen.getByLabelText('Set zoom level'));
  fireEvent.mouseLeave(screen.getByLabelText('Set zoom level').parentElement!);
  advance(5000);
  expect(screen.getByRole('menu')).toBeInTheDocument();
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.pointerDown(document.body);
  advance();
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
});

it('retains active search protection and hides after the query is cleared and focus leaves', async () => {
  const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();
  vi.useFakeTimers();
  setScrollTopAndScroll(scrollContainer, 300);
  const input = screen.getByLabelText('PDF search');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'keyword' } });
  fireEvent.blur(input);
  advance(5000);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.change(input, { target: { value: '' } });
  advance();
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
});

it('releases focus protection when choosing a focused menu item removes it', async () => {
  const { scrollContainer, toolbar } = await renderToolbarVisibilityHarness();
  vi.useFakeTimers();
  setScrollTopAndScroll(scrollContainer, 300);
  fireEvent.click(screen.getByLabelText('Set zoom level'));
  const item = screen.getByRole('menuitem', { name: '125%' });
  act(() => item.focus());
  fireEvent.click(item);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  advance();
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
});
