import { fireEvent, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';

it('sends with Enter and keeps Shift+Enter for a newline', () => {
  const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
      inputLabel="Message"
      messageText="Ready"
      onMessageTextChange={vi.fn()}
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

it('keeps the send icon steady and blocks duplicate sends during an active turn', () => {
  const props = {
    inputLabel: 'Message',
    messageText: 'Ready',
    onMessageTextChange: vi.fn(),
    onSubmit: vi.fn(),
    placeholder: 'Ask',
    sendLabel: 'Send'
  };
  const { rerender } = renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer {...props} sending={false} />
  );
  const sendButton = screen.getByRole('button', { name: 'Send' });
  const sendIcon = sendButton.querySelector('svg');
  expect(sendIcon).toBeInTheDocument();
  const idleIcon = sendIcon?.innerHTML;

  rerender(<WorkspaceRightSidebarAssistantComposer {...props} sending />);

  expect(sendButton).toBeDisabled();
  expect(sendButton.querySelector('svg')?.innerHTML).toBe(idleIcon);
});

it('shows attached image previews and removes them', () => {
  const onRemoveImage = vi.fn();
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantComposer
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
      inputLabel="Message"
      messageText="Describe this"
      onAddImageFiles={onAddImageFiles}
      onMessageTextChange={vi.fn()}
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
