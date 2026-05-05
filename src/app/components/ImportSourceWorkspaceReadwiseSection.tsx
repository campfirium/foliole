import { Settings2 } from 'lucide-react';

import { isReadwiseReaderConfigReady, type ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { AppIconButton, AppStatusBadge, SettingsSection } from '../../shared/ui';

function ReadwiseSectionActions(props: {
  configured: boolean;
  onOpenConfig: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <AppStatusBadge label={props.configured ? 'Configured' : 'Needs setup'} tone={props.configured ? 'success' : 'warning'} />
      <AppIconButton icon={<Settings2 aria-hidden="true" size={15} strokeWidth={1.9} />} label="Open Readwise Reader settings" onClick={props.onOpenConfig} />
    </div>
  );
}

export function ImportSourceWorkspaceReadwiseSection(props: {
  readwiseReaderConfig: ReadwiseReaderConfig;
  readwiseRootPath: string;
  onOpenReadwiseConfig: () => void;
}) {
  const configured = props.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(props.readwiseReaderConfig);

  return (
    <SettingsSection
      actions={<ReadwiseSectionActions configured={configured} onOpenConfig={props.onOpenReadwiseConfig} />}
      ariaLabel="Readwise Reader settings"
      className="mb-6"
      description="Open the Readwise setup panel to choose the root folder, test the parser, and save this source."
      title="Readwise Reader for Obsidian settings"
    >
      <p className="text-sm leading-6 text-foreground/68">
        Keep the outer area simple for now. The Readwise-specific setup stays inside its own panel, and the category folders remain out of the main flow until we design them properly.
      </p>
    </SettingsSection>
  );
}
