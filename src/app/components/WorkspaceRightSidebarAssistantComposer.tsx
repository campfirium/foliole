import { ImagePlus, LoaderCircle, SendHorizontal } from 'lucide-react';
import { useRef } from 'react';
import type { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent, RefObject } from 'react';

import type { NativeAssistantImageDraft } from '../../../lib/platform/nativeAssistantImageContract';
import { AppIconButton } from '../../shared/ui';

import { WorkspaceRightSidebarAssistantContextFollowControl } from './WorkspaceRightSidebarAssistantContextFollowControl';
import { WorkspaceRightSidebarAssistantImageStrip } from './WorkspaceRightSidebarAssistantImageStrip';

type AssistantComposerProps = {
  attachImageLabel?: string;
  contextFollowDescription: string;
  contextFollowEnabled: boolean;
  contextFollowLabel: string;
  inputLabel: string;
  inputRef?: RefObject<HTMLTextAreaElement>;
  imageErrorText?: string | null;
  images?: NativeAssistantImageDraft[];
  messageText: string;
  onAddImageFiles?: (files: File[]) => void;
  onMessageTextChange: (text: string) => void;
  onRemoveImage?: (index: number) => void;
  onToggleContextFollow: () => void;
  onSubmit: (event: FormEvent) => void;
  placeholder: string;
  removeImageLabel?: string;
  sendLabel: string;
  sending: boolean;
};

export function WorkspaceRightSidebarAssistantComposer(props: AssistantComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="min-w-0 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 focus-within:border-border-strong"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => addDroppedImages(event, props.onAddImageFiles ?? ignoreFiles)}
      onSubmit={props.onSubmit}
    >
      <textarea
        aria-label={props.inputLabel}
        className="min-h-20 w-full resize-none bg-transparent text-ui-md leading-5 text-foreground outline-none placeholder:text-foreground/42"
        onChange={(event) => props.onMessageTextChange(event.target.value)}
        onKeyDown={submitOnEnter}
        onPaste={(event) => addPastedImages(event, props.onAddImageFiles ?? ignoreFiles)}
        placeholder={props.placeholder}
        ref={props.inputRef}
        rows={3}
        value={props.messageText}
      />
      <WorkspaceRightSidebarAssistantImageStrip
        images={props.images ?? []}
        {...(props.onRemoveImage ? { onRemove: props.onRemoveImage } : {})}
        {...(props.removeImageLabel ? { removeLabel: props.removeImageLabel } : {})}
      />
      {props.imageErrorText ? (
        <p className="m-0 pb-1 text-ui-sm text-danger" role="status">{props.imageErrorText}</p>
      ) : null}
      <AssistantComposerActions fileInputRef={fileInputRef} props={props} />
    </form>
  );
}

function AssistantComposerActions(props: {
  fileInputRef: RefObject<HTMLInputElement>;
  props: AssistantComposerProps;
}) {
  const composer = props.props;
  return <div className="flex items-center justify-between gap-2">
    <div className="flex min-w-0 items-center gap-1">
      <WorkspaceRightSidebarAssistantContextFollowControl
        description={composer.contextFollowDescription}
        enabled={composer.contextFollowEnabled}
        label={composer.contextFollowLabel}
        onToggle={composer.onToggleContextFollow}
      />
      <AppIconButton
        className="size-7 text-foreground/55"
        icon={<ImagePlus aria-hidden className="size-4" strokeWidth={1.8} />}
        label={composer.attachImageLabel ?? 'Add images'}
        onClick={() => props.fileInputRef.current?.click()}
        type="button"
      />
      <input
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        multiple
        onChange={(event) => {
          composer.onAddImageFiles?.(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
        ref={props.fileInputRef}
        type="file"
      />
    </div>
    <AppIconButton
      className="rounded-full bg-foreground/8 text-foreground hover:bg-foreground/12 disabled:bg-foreground/8"
      disabled={composer.sending || !composer.messageText.trim()}
      icon={composer.sending
        ? <LoaderCircle aria-hidden className="size-4 animate-spin" strokeWidth={1.8} />
        : <SendHorizontal aria-hidden className="size-4" strokeWidth={1.8} />}
      label={composer.sendLabel}
      type="submit"
    />
  </div>;
}

function ignoreFiles() {}

function addPastedImages(event: ClipboardEvent<HTMLTextAreaElement>, add: (files: File[]) => void) {
  const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;
  event.preventDefault();
  add(files);
}

function addDroppedImages(event: DragEvent<HTMLFormElement>, add: (files: File[]) => void) {
  event.preventDefault();
  const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
  if (files.length) add(files);
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
