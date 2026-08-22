import { Download, Search } from 'lucide-react';

import type { Translate } from '../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../shared/localization/translations';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppButton,
  AppInput,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../shared/ui';

import { CustomCopyDialogList } from './CustomCopyDialogList';

interface CustomCopyDialogSurfaceProps {
  items: Array<{ key: TranslationKey; value: string }>;
  onChange: (key: TranslationKey, value: string | null) => void;
  onExport: () => void;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onReplacedOnlyChange: (value: boolean) => void;
  open: boolean;
  overrides: Partial<Record<TranslationKey, string>>;
  query: string;
  replacedOnly: boolean;
  t: Translate;
}

function DialogHeader(props: Pick<CustomCopyDialogSurfaceProps, 'onExport' | 'overrides' | 't'>) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <AppDialogTitle>{props.t('settings.customCopy.dialog.title')}</AppDialogTitle>
        <AppDialogDescription className="mt-1" id="custom-copy-description">
          {props.t('settings.customCopy.dialog.description')}
        </AppDialogDescription>
      </div>
      <AppButton disabled={Object.keys(props.overrides).length === 0} onClick={props.onExport}>
        <Download className="size-4" />
        {props.t('settings.customCopy.export')}
      </AppButton>
    </header>
  );
}

function DialogTools(props: Pick<CustomCopyDialogSurfaceProps, 'onQueryChange' | 'onReplacedOnlyChange' | 'query' | 'replacedOnly' | 't'>) {
  return (
    <div className="flex shrink-0 items-center gap-dialog-column-gap">
      <label className="relative block min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/38" />
        <AppInput aria-label={props.t('settings.customCopy.search.placeholder')} className="pl-9" onChange={(event) => props.onQueryChange(event.target.value)} placeholder={props.t('settings.customCopy.search.placeholder')} type="search" value={props.query} />
      </label>
      <label className="inline-flex shrink-0 items-center gap-3 text-ui-md text-foreground/80">
        <button aria-checked={props.replacedOnly} aria-label={props.t('settings.customCopy.filter.replacedOnly')} className={settingsSwitchClassName(props.replacedOnly)} onClick={() => props.onReplacedOnlyChange(!props.replacedOnly)} role="switch" type="button">
          <span aria-hidden="true" className={settingsSwitchKnobClassName(props.replacedOnly)} />
        </button>
        <span>{props.t('settings.customCopy.filter.replacedOnly')}</span>
      </label>
    </div>
  );
}

function DialogEntries(props: Pick<CustomCopyDialogSurfaceProps, 'items' | 'onChange' | 'overrides' | 't'>) {
  if (props.items.length > 0) {
    return <CustomCopyDialogList getEditLabel={(key) => props.t('settings.customCopy.edit.aria', { key })} items={props.items} onChange={props.onChange} overrides={props.overrides} />;
  }
  return (
    <div className="grid min-h-0 flex-1 place-items-center px-8 text-center">
      <div><div className="text-ui-md font-medium">{props.t('settings.customCopy.empty.title')}</div><div className="mt-1 text-ui-md text-muted-foreground">{props.t('settings.customCopy.empty.description')}</div></div>
    </div>
  );
}

export function CustomCopyDialogSurface(props: CustomCopyDialogSurfaceProps) {
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label={props.t('settings.overlay.aria')} />
        <AppDialogContent
          aria-describedby="custom-copy-description"
          className="flex h-[min(48rem,calc(100dvh-2rem))] w-[min(64rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden"
          layout="task"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            props.onOpenChange(false);
          }}
        >
          <DialogHeader onExport={props.onExport} overrides={props.overrides} t={props.t} />
          <AppDialogBody className="flex min-h-0 flex-1 flex-col">
            <DialogTools onQueryChange={props.onQueryChange} onReplacedOnlyChange={props.onReplacedOnlyChange} query={props.query} replacedOnly={props.replacedOnly} t={props.t} />
            <div className="mt-6 grid shrink-0 grid-cols-2 gap-dialog-column-gap border-b border-settings-divider/70 pb-2 text-ui-md font-medium text-foreground/58">
              <span>{props.t('settings.customCopy.column.original')}</span><span>{props.t('settings.customCopy.column.custom')}</span>
            </div>
            <DialogEntries items={props.items} onChange={props.onChange} overrides={props.overrides} t={props.t} />
          </AppDialogBody>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
