import type { FormEvent } from 'react';

import {
  AppButton,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';

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
      <form className="flex gap-2" onSubmit={props.onSubmit}>
        <input
          aria-label={props.inputLabel}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg-subtle px-3 py-2 text-ui-md text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(event) => props.onMessageTextChange(event.target.value)}
          placeholder={props.placeholder}
          value={props.messageText}
        />
        <AppButton disabled={props.sending || !props.messageText.trim()} type="submit">
          {props.sendLabel}
        </AppButton>
      </form>
    </section>
  );
}
