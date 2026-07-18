import { useRef } from 'react';
import type { FormEvent } from 'react';

import { inspectorListMetaClassName } from '../../shared/ui';

import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';
import { WorkspaceRightSidebarAssistantMessageViewport } from './WorkspaceRightSidebarAssistantMessageViewport';
import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

interface AssistantConversationProps {
  activeMessages: AssistantMessage[];
  contextFollowDescription: string;
  contextFollowEnabled: boolean;
  contextFollowLabel: string;
  inputLabel: string;
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onToggleContextFollow: () => void;
  onEditMessage: (text: string) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder: string;
  pendingLabel: string;
  sendLabel: string;
  sending: boolean;
  statusLabel: string | null;
  transitionEvent: {
    actionLabel?: string;
    onAction?: () => void;
    placement: 'after-messages' | 'after-user';
    text: string;
  } | null;
  threadPreviewLabel: string | null;
}

export function WorkspaceRightSidebarAssistantConversation(props: AssistantConversationProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editMessage = (text: string) => {
    props.onEditMessage(text);
    inputRef.current?.focus();
  };
  return (
    <section className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-3 pt-3">
      {props.statusLabel ? (
        <p className={`${inspectorListMetaClassName} m-0 px-3`}>{props.statusLabel}</p>
      ) : null}
      {props.threadPreviewLabel ? (
        <div className="px-3">
          <p className={`${inspectorListMetaClassName} m-0 rounded-sm bg-foreground/[0.035] px-2 py-1.5`}>
            {props.threadPreviewLabel}
          </p>
        </div>
      ) : null}
      <WorkspaceRightSidebarAssistantMessageViewport
        messages={props.activeMessages}
        onEditMessage={editMessage}
        pendingLabel={props.pendingLabel}
        transitionEvent={props.transitionEvent}
      />
      <div className="px-3 pb-3">
        <WorkspaceRightSidebarAssistantComposer
          contextFollowDescription={props.contextFollowDescription}
          contextFollowEnabled={props.contextFollowEnabled}
          contextFollowLabel={props.contextFollowLabel}
          inputLabel={props.inputLabel}
          inputRef={inputRef}
          messageText={props.messageText}
          onMessageTextChange={props.onMessageTextChange}
          onToggleContextFollow={props.onToggleContextFollow}
          onSubmit={props.onSubmit}
          placeholder={props.placeholder}
          sendLabel={props.sendLabel}
          sending={props.sending}
        />
      </div>
    </section>
  );
}
