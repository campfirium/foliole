import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { CompanionDirectoryList } from './CompanionDirectoryListSurface';
import { CompanionListViewport, CompanionListViewportProvider } from './CompanionListViewport';
import { CompanionTopicListMenu } from './CompanionTopicListMenu';

const items = Array.from({ length: 1000 }, (_, index) => `topic-${index}`);
function Harness(props: { visible?: boolean; entries?: string[]; menus?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return <div ref={scrollRef} data-testid="scroll">
    <div style={{ height: 80 }}>Header</div>
    <CompanionListViewportProvider scrollRef={scrollRef} sortIdentity="title">
      {props.visible !== false ? <CompanionListViewport viewKey="test" items={props.entries ?? items}
        getItemKey={(item) => item} estimateSize={() => 50}
        renderItem={(item) => <><button>{item}</button>{props.menus ? <CompanionTopicListMenu title={item} metadata="" onOpen={() => undefined} /> : null}</>} /> : <div>Reader</div>}
    </CompanionListViewportProvider>
  </div>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mockLayout() {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-index') ? 50 : 300;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(60000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.virtualList ? 80 - (this.closest('[data-testid="scroll"]')?.scrollTop ?? 0) : 0;
    return { top, bottom: top + 300, height: 300, width: 400, x: 0, y: top, left: 0, right: 400, toJSON() {} };
  });
}

it('windows the complete directory and keeps selection bound to entity identity', () => {
  mockLayout();
  const select = vi.fn();
  function Directory() {
    const ref = useRef<HTMLDivElement>(null);
    return <div ref={ref}><CompanionListViewportProvider scrollRef={ref} sortIdentity="title">
      <CompanionDirectoryList directory={{ folders: [], entries: [] } as never} emptyLabel="Empty"
        onSelectItem={select} snapshot={null} sections={[{ id: 'current', items: items.map((id) => ({
          id, nodeId: id, source: 'internal', kind: 'folder', title: id, preview: null
        })) }]} />
    </CompanionListViewportProvider></div>;
  }
  render(<Directory />);
  expect(screen.queryByTestId('companion-directory-node-topic-999')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button').length).toBeLessThan(50);
  fireEvent.click(screen.getByTestId('companion-directory-node-topic-2'));
  expect(select).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'topic-2' }));
});

it('accounts for the header and restores the first visible entity after returning', async () => {
  mockLayout();
  const view = render(<Harness />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
  const scroll = screen.getByTestId('scroll');
  fireEvent.touchStart(scroll, { changedTouches: [{ clientX: 20, clientY: 20 }], touches: [{ clientX: 20, clientY: 20 }] });
  fireEvent.scroll(scroll, { target: { scrollTop: 5087 } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'topic-100' })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'topic-0' })).not.toBeInTheDocument();
  view.rerender(<Harness visible={false} />);
  scroll.scrollTop = 0;
  view.rerender(<Harness />);
  await waitFor(() => expect(scroll.scrollTop).toBe(5087));
  expect(screen.getAllByRole('button').length).toBeLessThan(60);
});

it('keeps the visible identity across insertions and falls back to its surviving neighbor', async () => {
  mockLayout();
  const view = render(<Harness />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
  const scroll = screen.getByTestId('scroll');
  fireEvent.touchStart(scroll, { changedTouches: [{ clientX: 20, clientY: 20 }], touches: [{ clientX: 20, clientY: 20 }] });
  fireEvent.scroll(scroll, { target: { scrollTop: 5087 } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'topic-100' })).toBeInTheDocument());
  view.rerender(<Harness entries={['new-topic', ...items]} />);
  await waitFor(() => expect(scroll.scrollTop).toBe(5137));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
  view.rerender(<Harness entries={['new-topic', ...items.filter((item) => item !== 'topic-100')]} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'topic-101' })).toBeInTheDocument());
  expect(scroll.scrollTop).toBe(5137);
});

it('retains only the focused row outside the window and releases it after blur', async () => {
  mockLayout();
  render(<Harness />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
  const target = screen.getByRole('button', { name: 'topic-2' });
  fireEvent.focus(target);
  const scroll = screen.getByTestId('scroll');
  fireEvent.touchStart(scroll, { changedTouches: [{ clientX: 20, clientY: 20 }], touches: [{ clientX: 20, clientY: 20 }] });
  fireEvent.scroll(scroll, { target: { scrollTop: 5087 } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'topic-100' })).toBeInTheDocument());
  expect(target).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'topic-1' })).not.toBeInTheDocument();
  fireEvent.blur(target);
  await waitFor(() => expect(target).not.toBeInTheDocument());
});


it('keeps an open menu attached when scrolling mounts other closed menus', async () => {
  mockLayout();
  render(<Harness menus />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
  const target = screen.getByRole('button', { name: 'topic-2' });
  fireEvent.click(screen.getByRole('button', { name: 'More: topic-2' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const scroll = screen.getByTestId('scroll');
  fireEvent.touchStart(scroll, { changedTouches: [{ clientX: 20, clientY: 20 }], touches: [{ clientX: 20, clientY: 20 }] });
  fireEvent.scroll(scroll, { target: { scrollTop: 5087 } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'topic-100', hidden: true })).toBeInTheDocument());
  expect(target).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('stops return correction as soon as the user touches the list', async () => {
  mockLayout();
  const view = render(<Harness />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
  const scroll = screen.getByTestId('scroll');
  fireEvent.touchStart(scroll, { changedTouches: [{ clientX: 20, clientY: 20 }], touches: [{ clientX: 20, clientY: 20 }] });
  fireEvent.scroll(scroll, { target: { scrollTop: 5087 } });
  view.rerender(<Harness visible={false} />);
  scroll.scrollTop = 0;
  view.rerender(<Harness />);
  fireEvent.touchStart(scroll, { changedTouches: [{ clientX: 20, clientY: 20 }], touches: [{ clientX: 20, clientY: 20 }] });
  fireEvent.scroll(scroll, { target: { scrollTop: 8000 } });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
  expect(scroll.scrollTop).toBe(8000);
});
