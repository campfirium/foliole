import type {
  NativeAssistantWriteApproval,
  NativeAssistantWriteChange,
  NativeAssistantWriteChangeDetail
} from '../../../lib/platform/nativeAssistantContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton } from '../../shared/ui';

type Translate = ReturnType<typeof useTranslation>;
type TranslationKey = Parameters<Translate>[0];

const PREFIX = 'desktop.rightPanel.assistant.writeApproval';

export function WorkspaceRightSidebarAssistantWriteApproval(props: {
  approval: NativeAssistantWriteApproval;
  onResolve: (approved: boolean) => void;
}) {
  const t = useTranslation();
  const title = t(`${PREFIX}.title` as TranslationKey);
  return (
    <section aria-label={title} className="mb-2 rounded-md border border-border bg-foreground/[0.03] p-2.5 text-ui-sm">
      <h3 className="m-0 text-ui-sm font-medium">{title}</h3>
      <ul className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
        {props.approval.changes.map((change, index) => (
          <WriteChangeRow change={change} key={index} t={t} />
        ))}
      </ul>
      <div className="mt-2.5 flex justify-end gap-2">
        <AppButton className="min-h-7 px-2.5 text-ui-base" onClick={() => props.onResolve(false)} variant="ghost">
          {t(`${PREFIX}.decline` as TranslationKey)}
        </AppButton>
        <AppButton className="min-h-7 px-2.5 text-ui-base" onClick={() => props.onResolve(true)} variant="emphasis">
          {t(`${PREFIX}.allow` as TranslationKey)}
        </AppButton>
      </div>
    </section>
  );
}

function WriteChangeRow({ change, t }: { change: NativeAssistantWriteChange; t: Translate }) {
  const toolKey = `${PREFIX}.tool.${change.tool}` as TranslationKey;
  const action = t(toolKey);
  return (
    <li className="min-w-0">
      <p className="m-0 break-words">
        <span className="font-medium">{action === toolKey ? t(`${PREFIX}.tool.default` as TranslationKey) : action}</span>
        {change.target ? <span className="text-foreground/80">{` · ${change.target}`}</span> : null}
      </p>
      {groupDetails(change.details).map(([field, values]) => (
        <p className="m-0 break-words text-ui-xs text-foreground/65" key={field}>
          {`${t(`${PREFIX}.field.${field}` as TranslationKey)}: `}
          {values.map((value) => formatDetailValue(field, value, t)).join(', ')}
        </p>
      ))}
    </li>
  );
}

function formatDetailValue(field: NativeAssistantWriteChangeDetail['field'], value: string, t: Translate) {
  if (value) return value;
  if (field === 'parent') return t(`${PREFIX}.root`);
  if (field === 'content' || field === 'question') return t(`${PREFIX}.clear`);
  return value;
}

function groupDetails(details: NativeAssistantWriteChangeDetail[]) {
  const groups = new Map<NativeAssistantWriteChangeDetail['field'], string[]>();
  for (const detail of details) groups.set(detail.field, [...(groups.get(detail.field) ?? []), detail.value]);
  return [...groups];
}
