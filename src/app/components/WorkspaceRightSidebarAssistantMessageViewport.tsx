import { ArrowDown } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppIconButton, appFloatingSurfaceClassName, inspectorListMetaClassName } from '../../shared/ui';

import { useWorkspaceRightSidebarAssistantScroll } from './useWorkspaceRightSidebarAssistantScroll';
import { WorkspaceRightSidebarAssistantMessageRow } from './WorkspaceRightSidebarAssistantMessageRow';
import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

export function WorkspaceRightSidebarAssistantMessageViewport(props: {
  messages: AssistantMessage[];
  onEditMessage: (text: string) => void;
  pendingLabel: string;
  transitionEvent: {
    actionLabel?: string;
    onAction?: () => void;
    placement: 'after-messages' | 'after-user';
    text: string;
  } | null;
}) {
  const t = useTranslation();
  const scroll = useWorkspaceRightSidebarAssistantScroll(createScrollContentKey(props.messages));
  return (
    <div className="relative min-h-24 min-w-0 w-full flex-1">
      <div
        className="app-scrollbar absolute inset-0 overflow-y-auto"
        data-testid="assistant-message-scroll"
        onScroll={scroll.onScroll}
        ref={scroll.scrollRef}
      >
        <div className="min-w-0 space-y-5 px-3 pb-1">
          {renderConversationItems(props)}
        </div>
      </div>
      {scroll.showScrollToLatest ? (
        <AppIconButton
          className={appFloatingSurfaceClassName(
            'popover',
            'absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full'
          )}
          icon={<ArrowDown aria-hidden className="size-4" strokeWidth={1.8} />}
          label={t('desktop.rightPanel.assistant.scrollToLatest')}
          onClick={scroll.scrollToLatest}
        />
      ) : null}
    </div>
  );
}

function renderConversationItems(props: Parameters<typeof WorkspaceRightSidebarAssistantMessageViewport>[0]) {
  const eventIndex = props.transitionEvent?.placement === 'after-user'
    ? findLastUserIndex(props.messages) + 1
    : props.messages.length;
  const rows = props.messages.map((message) => (
    <WorkspaceRightSidebarAssistantMessageRow
      key={message.id}
      message={message}
      onEditMessage={props.onEditMessage}
      pendingLabel={props.pendingLabel}
    />
  ));
  if (props.transitionEvent) rows.splice(eventIndex, 0, <AssistantTransitionEvent
    event={props.transitionEvent}
    key="assistant-transition-event"
  />);
  return rows;
}

function findLastUserIndex(messages: AssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return index;
  }
  return -1;
}

function AssistantTransitionEvent(props: {
  event: NonNullable<Parameters<typeof WorkspaceRightSidebarAssistantMessageViewport>[0]['transitionEvent']>;
}) {
  return (
    <div className="flex items-center gap-2 px-1" data-message-role="system">
      <p className={`${inspectorListMetaClassName} m-0 min-w-0 flex-1`}>{props.event.text}</p>
      {props.event.onAction && props.event.actionLabel ? (
        <AppButton onClick={props.event.onAction} size="sm" type="button">
          {props.event.actionLabel}
        </AppButton>
      ) : null}
    </div>
  );
}

function createScrollContentKey(messages: AssistantMessage[]) {
  return messages.map((message) => `${message.id}:${message.state ?? 'ready'}:${message.text.length}`).join('|');
}
