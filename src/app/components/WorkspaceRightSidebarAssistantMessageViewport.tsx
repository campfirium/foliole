import { ArrowDown } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, appFloatingSurfaceClassName } from '../../shared/ui';

import { useWorkspaceRightSidebarAssistantScroll } from './useWorkspaceRightSidebarAssistantScroll';
import { WorkspaceRightSidebarAssistantMessageRow } from './WorkspaceRightSidebarAssistantMessageRow';
import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

export function WorkspaceRightSidebarAssistantMessageViewport(props: {
  messages: AssistantMessage[];
  onEditMessage: (text: string) => void;
  pendingLabel: string;
}) {
  const t = useTranslation();
  const scroll = useWorkspaceRightSidebarAssistantScroll(createScrollContentKey(props.messages));
  return (
    <div className="relative min-h-24 flex-1">
      <div
        className="app-scrollbar absolute inset-0 space-y-5 overflow-y-auto pr-1"
        data-testid="assistant-message-scroll"
        onScroll={scroll.onScroll}
        ref={scroll.scrollRef}
      >
        {props.messages.map((message) => (
          <WorkspaceRightSidebarAssistantMessageRow
            key={message.id}
            message={message}
            onEditMessage={props.onEditMessage}
            pendingLabel={props.pendingLabel}
          />
        ))}
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

function createScrollContentKey(messages: AssistantMessage[]) {
  return messages.map((message) => `${message.id}:${message.state ?? 'ready'}:${message.text.length}`).join('|');
}
