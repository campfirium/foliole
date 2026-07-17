import { LoaderCircle } from 'lucide-react';

import { WorkspaceRightSidebarAssistantMarkdown } from './WorkspaceRightSidebarAssistantMarkdown';
import { WorkspaceRightSidebarAssistantMessageActions } from './WorkspaceRightSidebarAssistantMessageActions';
import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

export function WorkspaceRightSidebarAssistantMessageRow(props: {
  message: AssistantMessage;
  onEditMessage?: (text: string) => void;
  pendingLabel: string;
}) {
  const onEditMessage = props.onEditMessage;
  if (props.message.activity === 'thinking') return <AssistantThinking label={props.pendingLabel} />;
  if (props.message.role === 'user') {
    return (
      <div className="flex min-w-0 w-full flex-col items-end gap-1" data-message-role="user">
        <p className="m-0 max-w-[88%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-foreground/[0.07] px-3 py-2 text-left text-ui-md leading-6 text-foreground/84">
          {props.message.text}
        </p>
        <WorkspaceRightSidebarAssistantMessageActions
          align="right"
          text={props.message.text}
          {...(onEditMessage
            ? { onEdit: () => onEditMessage(props.message.text) }
            : {})}
        />
      </div>
    );
  }
  return (
    <div
      className={props.message.state === 'failed' && !props.message.failureText
        ? 'min-w-0 w-full px-1 text-danger'
        : 'min-w-0 w-full px-1'}
      data-message-role="assistant"
    >
      <WorkspaceRightSidebarAssistantMarkdown source={props.message.text} />
      {props.message.failureText ? (
        <p className="mb-0 mt-2 text-ui-sm text-danger">{props.message.failureText}</p>
      ) : null}
      {props.message.state !== 'pending' ? (
        <WorkspaceRightSidebarAssistantMessageActions align="left" text={props.message.text} />
      ) : null}
      {props.message.state === 'pending' ? (
        <span aria-hidden className="mt-1 inline-block h-4 w-0.5 animate-pulse bg-foreground/55" />
      ) : null}
    </div>
  );
}

function AssistantThinking(props: { label: string }) {
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 px-1 py-1 text-ui-sm text-foreground/58"
      role="status"
    >
      <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.8} />
      <span>{props.label}</span>
      <span aria-hidden className="flex items-center gap-1">
        <span className="size-1 animate-pulse rounded-full bg-current" />
        <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
        <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
      </span>
    </div>
  );
}
