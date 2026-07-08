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
  sendLabel: string;
  sending: boolean;
  sessionLabel: string;
}) {
  return (
    <section
      className={`${inspectorListInsetPaddingClassName} flex min-h-0 flex-1 flex-col gap-2 py-3`}
    >
      <p className={inspectorListMetaClassName}>{props.sessionLabel}</p>
      <div className="app-scrollbar min-h-24 flex-1 space-y-2 overflow-y-auto">
        {props.activeMessages.map((message) => (
          <WorkspaceRightSidebarAssistantMessageRow key={message.id} message={message} />
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
