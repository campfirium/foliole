import type { FormEvent } from 'react';

import {
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';
import { WorkspaceRightSidebarAssistantMessageRow } from './WorkspaceRightSidebarAssistantMessageRow';
import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

export function WorkspaceRightSidebarAssistantConversation(props: {
  activeMessages: AssistantMessage[];
  inputLabel: string;
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder: string;
  pendingLabel: string;
  sendLabel: string;
  sending: boolean;
  threadPreviewLabel: string | null;
  threadStatusLabel: string | null;
}) {
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
      <div className="app-scrollbar min-h-24 flex-1 space-y-5 overflow-y-auto pr-1">
        {props.activeMessages.map((message) => (
          <WorkspaceRightSidebarAssistantMessageRow
            key={message.id}
            message={message}
            pendingLabel={props.pendingLabel}
          />
        ))}
      </div>
      <WorkspaceRightSidebarAssistantComposer
        inputLabel={props.inputLabel}
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
