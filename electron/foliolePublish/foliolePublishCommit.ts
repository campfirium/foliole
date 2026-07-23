import fs from 'node:fs';
import path from 'node:path';

import type { FoliolePublishIndex } from './foliolePublishModel.js';
import { writeFileAtomic, writePublishIndex } from './foliolePublishModel.js';
import { activateFoliolePublishSite, discardStagedFoliolePublishSite } from './foliolePublishSite.js';

export function commitPublishedTopic(input: {
  content: string;
  index: FoliolePublishIndex;
  root: string;
  staged: string;
  topicFile: string;
}) {
  const contentFile = path.join(input.root, input.topicFile);
  const indexFile = path.join(input.root, 'publish.yaml');
  const oldContent = fs.existsSync(contentFile) ? fs.readFileSync(contentFile) : null;
  const oldIndex = fs.existsSync(indexFile) ? fs.readFileSync(indexFile) : null;
  const activation = activateFoliolePublishSite(input.root, input.staged);
  try {
    writeFileAtomic(contentFile, input.content);
    writePublishIndex(input.root, input.index);
    activation.commit();
    return activation.activePath;
  } catch (error) {
    activation.rollback();
    if (oldContent) writeFileAtomic(contentFile, oldContent); else fs.rmSync(contentFile, { force: true });
    if (oldIndex) writeFileAtomic(indexFile, oldIndex); else fs.rmSync(indexFile, { force: true });
    throw new Error(`The site was deployed, but Foliole could not save the local publish state: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    discardStagedFoliolePublishSite(input.staged);
  }
}
