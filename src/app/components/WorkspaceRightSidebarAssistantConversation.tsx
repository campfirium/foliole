import { useEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { inspectorListMetaClassName } from '../../shared/ui';

import { WorkspaceRightSidebarAssistantComposer } from './WorkspaceRightSidebarAssistantComposer';
import { WorkspaceRightSidebarAssistantMessageViewport } from './WorkspaceRightSidebarAssistantMessageViewport';
import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

interface AssistantConversationProps {
  activeMessages: AssistantMessage[];
  attachImageLabel?: string;
  focusRequest?: number | null;
  inputLabel: string;
  imageErrorText?: string | null;
  images?: import('../../../lib/platform/nativeAssistantImageContract').NativeAssistantImageDraft[];
  messageText: string;
  modelControl?: ReactNode;
  materialTags?: ReactNode;
  /** Changes the reply is waiting on, shown above the composer. */
  writeApproval?: ReactNode;
  onAddImageFiles?: (files: File[]) => void;
  onRemoveImage?: (index: number) => void;
  onMessageTextChange: (text: string) => void;
  onEditMessage: (message: AssistantMessage) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder: string;
  pendingLabel: string;
  removeImageLabel?: string;
  sendLabel: string;
  sending: boolean;
  statusLabel: string | null;
  transitionEvent: {
    actionLabel?: string;
    afterMessageId?: string;
    onAction?: () => void;
    suffix?: string;
    text: string;
  } | null;
  threadPreviewLabel: string | null;
}

export function WorkspaceRightSidebarAssistantConversation(props: AssistantConversationProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (props.focusRequest != null) inputRef.current?.focus();
  }, [props.focusRequest]);
  const editMessage = (message: AssistantMessage) => {
    props.onEditMessage(message);
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
        {props.writeApproval}
        {props.materialTags}
        <WorkspaceRightSidebarAssistantComposer
          {...(props.attachImageLabel ? { attachImageLabel: props.attachImageLabel } : {})}
          inputLabel={props.inputLabel}
          inputRef={inputRef}
          {...(props.imageErrorText ? { imageErrorText: props.imageErrorText } : {})}
          {...(props.images ? { images: props.images } : {})}
          messageText={props.messageText}
          {...(props.modelControl ? { modelControl: props.modelControl } : {})}
          {...(props.onAddImageFiles ? { onAddImageFiles: props.onAddImageFiles } : {})}
          onMessageTextChange={props.onMessageTextChange}
          {...(props.onRemoveImage ? { onRemoveImage: props.onRemoveImage } : {})}
          onSubmit={props.onSubmit}
          placeholder={props.placeholder}
          {...(props.removeImageLabel ? { removeImageLabel: props.removeImageLabel } : {})}
          sendLabel={props.sendLabel}
          sending={props.sending}
        />
      </div>
    </section>
  );
}
