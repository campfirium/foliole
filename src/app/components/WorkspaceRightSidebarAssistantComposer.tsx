import { SendHorizontal } from 'lucide-react';
import type { FormEvent } from 'react';

import { AppIconButton } from '../../shared/ui';

export function WorkspaceRightSidebarAssistantComposer(props: {
  inputLabel: string;
  messageText: string;
  onMessageTextChange: (text: string) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder: string;
  sendLabel: string;
  sending: boolean;
}) {
  return (
    <form
      className="rounded-lg border border-border bg-bg-subtle px-3 py-2 focus-within:border-border-strong"
      onSubmit={props.onSubmit}
    >
      <textarea
        aria-label={props.inputLabel}
        className="min-h-20 w-full resize-none bg-transparent text-ui-md leading-5 text-foreground outline-none placeholder:text-foreground/42"
        onChange={(event) => props.onMessageTextChange(event.target.value)}
        placeholder={props.placeholder}
        rows={3}
        value={props.messageText}
      />
      <div className="flex items-center justify-end">
        <AppIconButton
          className="rounded-full bg-foreground/8 text-foreground hover:bg-foreground/12 disabled:bg-foreground/8"
          disabled={props.sending || !props.messageText.trim()}
          icon={<SendHorizontal aria-hidden className="size-4" strokeWidth={1.8} />}
          label={props.sendLabel}
          type="submit"
        />
      </div>
    </form>
  );
}
