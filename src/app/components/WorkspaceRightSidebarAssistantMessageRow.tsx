import type { AssistantMessage } from './workspaceRightSidebarAssistantPanelModel';

export function WorkspaceRightSidebarAssistantMessageRow(props: { message: AssistantMessage }) {
  const alignment =
    props.message.role === 'user' ? 'items-end text-right' : 'items-start text-left';
  return (
    <div className={`flex flex-col ${alignment}`}>
      <p className="max-w-full rounded-md bg-[color-mix(in_srgb,var(--app-surface)_94%,rgb(var(--color-foreground))_6%)] px-3 py-2 text-ui-md leading-5 text-foreground/82">
        {props.message.text}
      </p>
    </div>
  );
}
