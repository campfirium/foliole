import { useState } from 'react';

import {
  loadPublishingSectionExpansion,
  savePublishingSectionExpansion,
  type PublishingSectionId
} from '../../model/publishingSectionExpansion';

import { DiscoursePublishingSettings } from './DiscoursePublishingSettings';
import { FoliolePublishingSettings } from './FoliolePublishingSettings';
import { WordPressPublishingSettings } from './WordPressPublishingSettings';

export function SettingsPublishingSection({ previewDesktopSettings = false }: {
  previewDesktopSettings?: boolean;
}) {
  const [expanded, setExpanded] = useState(loadPublishingSectionExpansion);

  const updateExpanded = (id: PublishingSectionId, value: boolean) => {
    setExpanded((current) => {
      if (current[id] === value) return current;
      const next = { ...current, [id]: value };
      savePublishingSectionExpansion(next);
      return next;
    });
  };

  return (
    <>
      <FoliolePublishingSettings expanded={expanded.foliole} onExpandedChange={(value) => updateExpanded('foliole', value)} previewDesktopSettings={previewDesktopSettings} />
      <WordPressPublishingSettings expanded={expanded.wordpress} onExpandedChange={(value) => updateExpanded('wordpress', value)} previewDesktopSettings={previewDesktopSettings} />
      <DiscoursePublishingSettings expanded={expanded.discourse} onExpandedChange={(value) => updateExpanded('discourse', value)} previewDesktopSettings={previewDesktopSettings} />
    </>
  );
}
