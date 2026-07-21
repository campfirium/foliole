import { ArrowDown } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, appFloatingSurfaceClassName, inspectorListMetaClassName } from '../../shared/ui';

import { useWorkspaceRightSidebarAssistantScroll } from './useWorkspaceRightSidebarAssistantScroll';
import { WorkspaceRightSidebarAssistantMessageRow } from './WorkspaceRightSidebarAssistantMessageRow';
import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

export function WorkspaceRightSidebarAssistantMessageViewport(props: {
  messages: AssistantMessage[];
  onEditMessage: (message: AssistantMessage) => void;
  pendingLabel: string;
  transitionEvent: {
    actionLabel?: string;
    afterMessageId?: string;
    onAction?: () => void;
    suffix?: string;
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
            'absolute bottom-2 left-1/2 z-local-control -translate-x-1/2 rounded-full'
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
  const boundaryIndex = props.transitionEvent?.afterMessageId
    ? props.messages.findIndex((message) => message.id === props.transitionEvent?.afterMessageId)
    : -1;
  const eventIndex = boundaryIndex >= 0 ? boundaryIndex + 1 : props.messages.length;
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

function AssistantTransitionEvent(props: {
  event: NonNullable<Parameters<typeof WorkspaceRightSidebarAssistantMessageViewport>[0]['transitionEvent']>;
}) {
  return (
    <div className="px-1" data-message-role="system">
      <p className={`${inspectorListMetaClassName} m-0 min-w-0`}>
        {props.event.text}
        {props.event.onAction && props.event.actionLabel ? (
          <>
            <a
              className="text-inherit underline decoration-current/55 underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              href="#"
              onClick={(event) => {
                event.preventDefault();
                props.event.onAction?.();
              }}
            >
              {props.event.actionLabel}
            </a>
            {props.event.suffix}
          </>
        ) : null}
      </p>
    </div>
  );
}

function createScrollContentKey(messages: AssistantMessage[]) {
  return messages.map((message) => `${message.id}:${message.state ?? 'ready'}:${message.text.length}`).join('|');
}
