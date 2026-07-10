import { useRef } from 'react';
import type { FormEvent } from 'react';

import {
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';
import { WorkspaceRightSidebarAssistantMessageViewport } from './WorkspaceRightSidebarAssistantMessageViewport';
import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

export function WorkspaceRightSidebarAssistantConversation(props: {
  activeMessages: AssistantMessage[];
  inputLabel: string;
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onEditMessage: (text: string) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder: string;
  pendingLabel: string;
  sendLabel: string;
  sending: boolean;
  threadPreviewLabel: string | null;
  threadStatusLabel: string | null;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editMessage = (text: string) => {
    props.onEditMessage(text);
    inputRef.current?.focus();
  };
  return (
    <section
      className={`${inspectorListInsetPaddingClassName} flex min-h-0 flex-1 flex-col gap-3 py-3`}
    >
      {props.threadStatusLabel ? (
        <p className={`${inspectorListMetaClassName} m-0`}>{props.threadStatusLabel}</p>
      ) : null}
      {props.threadPreviewLabel ? (
        <p className={`${inspectorListMetaClassName} m-0 rounded-sm bg-foreground/[0.035] px-2 py-1.5`}>
          {props.threadPreviewLabel}
        </p>
      ) : null}
      <WorkspaceRightSidebarAssistantMessageViewport
        messages={props.activeMessages}
        onEditMessage={editMessage}
        pendingLabel={props.pendingLabel}
      />
      <WorkspaceRightSidebarAssistantComposer
        inputLabel={props.inputLabel}
        inputRef={inputRef}
        messageText={props.messageText}
        onMessageTextChange={props.onMessageTextChange}
        onSubmit={props.onSubmit}
        placeholder={props.placeholder}
        sendLabel={props.sendLabel}
        sending={props.sending}
      />
    </section>
  );
}
