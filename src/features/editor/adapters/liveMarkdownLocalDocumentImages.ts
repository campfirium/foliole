import { buildExtDocImageRenderUrl } from '../../../../lib/platform/extDocImageProtocolUrl';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import { isRelativeImageSource } from '../model/markdownImageSourceKinds';

export function resolveLocalDocumentImageSource(imageMatch: MarkdownImageMatch, localDocumentPath: string | null) {
  if (!localDocumentPath || !isRelativeImageSource(imageMatch.source)) {
    return null;
  }
  return buildExtDocImageRenderUrl({
    documentAbsolutePath: localDocumentPath,
    imageDestination: imageMatch.source
  });
}
