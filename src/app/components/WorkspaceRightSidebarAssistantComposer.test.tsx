import { fireEvent, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';

it('sends with Enter and keeps Shift+Enter for a newline', () => {
  const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      contextFollowDescription="Attach current material"
      contextFollowEnabled
      contextFollowLabel="Following: Topic"
      inputLabel="Message"
      messageText="Ready"
      onMessageTextChange={vi.fn()}
      onToggleContextFollow={vi.fn()}
      onSubmit={onSubmit}
      placeholder="Ask"
      sendLabel="Send"
      sending={false}
    />
  );
  const input = screen.getByRole('textbox', { name: 'Message' });

  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSubmit).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it('shows progress in the send control while a turn is active', () => {
  const { container } = renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      contextFollowDescription="Attach current material"
      contextFollowEnabled
      contextFollowLabel="Following: Topic"
      inputLabel="Message"
      messageText="Ready"
      onMessageTextChange={vi.fn()}
      onToggleContextFollow={vi.fn()}
      onSubmit={vi.fn()}
      placeholder="Ask"
      sendLabel="Send"
      sending
    />
  );

  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(container.querySelector('.animate-spin')).toBeInTheDocument();
});

it('exposes the current material mode as a switch', () => {
  const onToggle = vi.fn();
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      contextFollowDescription="Attach current material"
      contextFollowEnabled
      contextFollowLabel="Following: Current topic"
      inputLabel="Message"
      messageText=""
      onMessageTextChange={vi.fn()}
      onSubmit={vi.fn()}
      onToggleContextFollow={onToggle}
      placeholder="Ask"
      sendLabel="Send"
      sending={false}
    />
  );

  const toggle = screen.getByRole('switch', { name: 'Following: Current topic' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(toggle).toHaveClass('size-7');
  expect(toggle).toHaveClass('border-border', 'bg-[var(--app-control-bg-hover-color)]', 'text-foreground/85');
  expect(toggle).not.toHaveTextContent('Following: Current topic');
  fireEvent.click(toggle);
  expect(onToggle).toHaveBeenCalledOnce();
});

it('keeps the detached state visually neutral', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      contextFollowDescription="Attach current material"
      contextFollowEnabled={false}
      contextFollowLabel="Attach the current topic"
      inputLabel="Message"
      messageText=""
      onMessageTextChange={vi.fn()}
      onSubmit={vi.fn()}
      onToggleContextFollow={vi.fn()}
      placeholder="Ask"
      sendLabel="Send"
      sending={false}
    />
  );

  const toggle = screen.getByRole('switch', { name: 'Attach the current topic' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(toggle).toHaveClass('text-foreground/48');
  expect(toggle).not.toHaveClass('border-border', 'bg-[var(--app-control-bg-hover-color)]', 'text-foreground/85');
});

it('shows attached image previews and removes them', () => {
  const onRemoveImage = vi.fn();
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      contextFollowDescription="Attach current material"
      contextFollowEnabled
      contextFollowLabel="Following: Topic"
      images={[{
        contentBase64: 'iVBORw0KGgo=',
        mimeType: 'image/png',
        originalName: 'diagram.png',
        sizeBytes: 8
      }]}
      inputLabel="Message"
      messageText="Describe this"
      onMessageTextChange={vi.fn()}
      onRemoveImage={onRemoveImage}
      onToggleContextFollow={vi.fn()}
      onSubmit={vi.fn()}
      placeholder="Ask"
      removeImageLabel="Remove image"
      sendLabel="Send"
      sending={false}
    />
  );

  expect(screen.getByRole('img', { name: 'diagram.png' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove image: diagram.png' }));
  expect(onRemoveImage).toHaveBeenCalledWith(0);
});

it('accepts pasted and dropped image files through the shared image entry', () => {
  const onAddImageFiles = vi.fn();
  const { container } = renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      contextFollowDescription="Attach current material"
      contextFollowEnabled
      contextFollowLabel="Following: Topic"
      inputLabel="Message"
      messageText="Describe this"
      onAddImageFiles={onAddImageFiles}
      onMessageTextChange={vi.fn()}
      onToggleContextFollow={vi.fn()}
      onSubmit={vi.fn()}
      placeholder="Ask"
      sendLabel="Send"
      sending={false}
    />
  );
  const file = new File(['png'], 'diagram.png', { type: 'image/png' });

  fireEvent.paste(screen.getByRole('textbox', { name: 'Message' }), {
    clipboardData: { files: [file] }
  });
  fireEvent.drop(container.querySelector('form') as HTMLFormElement, {
    dataTransfer: { files: [file] }
  });

  expect(onAddImageFiles).toHaveBeenNthCalledWith(1, [file]);
  expect(onAddImageFiles).toHaveBeenNthCalledWith(2, [file]);
});
