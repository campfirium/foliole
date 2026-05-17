import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { importImageAttachmentResource } from '../attachments/importImageAttachmentResource.js';
import { fetchRemoteImageResource } from '../attachments/remoteImagePipeline.js';
import { createNodeAttachmentLink } from '../database/attachments.js';

import { readImageIntrinsicSize, type ImageIntrinsicSize } from './imageIntrinsicSize.js';
import { layoutLocalizedMarkdownImage } from './localizedMarkdownImageLayout.js';

interface MarkdownImageToken {
  alt: string;
  from: number;
  raw: string;
  sourceUrl: string;
  suffix: string;
  to: number;
}

interface LocalizedImage {
  attachmentId: string;
  markdownUrl: string;
  size: ImageIntrinsicSize | null;
}

export interface ImageLocalizationResult {
  attachmentIds: string[];
  degradedMessages: string[];
  text: string;
}

interface ImageLocalizationOptions {
  layoutLargeImages?: boolean;
}

function isRemoteImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function collectRemoteMarkdownImages(markdown: string) {
  const matches: MarkdownImageToken[] = [];
  for (const reference of collectMarkdownImageReferences(markdown)) {
    const parsedTarget = parseMarkdownImageTarget(reference.rawTarget);
    if (parsedTarget && isRemoteImageUrl(parsedTarget.destination)) {
      matches.push({
        alt: reference.altText,
        from: reference.start,
        raw: reference.fullMatch,
        sourceUrl: parsedTarget.destination,
        suffix: parsedTarget.suffix,
        to: reference.end
      });
    }
  }
  return matches;
}

function buildLocalizedMarkdownImage(token: MarkdownImageToken, markdownUrl: string) {
  const suffix = token.suffix ? ` ${token.suffix}` : '';
  return `![${token.alt}](${markdownUrl}${suffix})`;
}

export function linkLocalizedImagesToNode(nodeId: string, attachmentIds: string[]) {
  Array.from(new Set(attachmentIds)).forEach((attachmentId) => {
    createNodeAttachmentLink({ attachmentId, nodeId, role: 'image' });
  });
}

export class ImageLocalizationContext {
  private readonly resultByUrl = new Map<string, Promise<LocalizedImage | null>>();
  private readonly degradedByUrl = new Map<string, string>();

  async localizeMarkdown(markdown: string, options: ImageLocalizationOptions = {}): Promise<ImageLocalizationResult> {
    const matches = collectRemoteMarkdownImages(markdown);
    if (matches.length === 0) {
      return { attachmentIds: [], degradedMessages: [], text: markdown };
    }
    const attachmentIds = new Set<string>();
    let localized = '';
    let cursor = 0;
    for (const match of matches) {
      const textBeforeImage = markdown.slice(cursor, match.from);
      const localization = await this.resolveRemoteImage(match.sourceUrl);
      if (localization) {
        attachmentIds.add(localization.attachmentId);
        const imageMarkdown = buildLocalizedMarkdownImage(match, localization.markdownUrl);
        const layout = options.layoutLargeImages === false
          ? { before: textBeforeImage, cursor: match.to, image: imageMarkdown }
          : layoutLocalizedMarkdownImage({
              imageMarkdown,
              markdown,
              range: match,
              size: localization.size,
              textBeforeImage
            });
        localized += layout.before;
        localized += layout.image;
        cursor = layout.cursor;
      } else {
        localized += textBeforeImage;
        localized += match.raw;
        cursor = match.to;
      }
    }
    localized += markdown.slice(cursor);
    return {
      attachmentIds: [...attachmentIds],
      degradedMessages: [...new Set(this.degradedByUrl.values())],
      text: localized
    };
  }

  private async resolveRemoteImage(sourceUrl: string) {
    if (!this.resultByUrl.has(sourceUrl)) {
      this.resultByUrl.set(sourceUrl, this.importRemoteImage(sourceUrl));
    }
    return this.resultByUrl.get(sourceUrl)!;
  }

  private async importRemoteImage(sourceUrl: string): Promise<LocalizedImage | null> {
    const fetched = await fetchRemoteImageResource(sourceUrl);
    if (fetched.status === 'error') {
      this.degradedByUrl.set(sourceUrl, fetched.error.status === 'error' ? fetched.error.message : 'The remote image could not be imported.');
      return null;
    }
    const imported = await importImageAttachmentResource({
      bytes: fetched.resource.bytes,
      errorSource: fetched.resource.sourceUrl,
      mimeType: fetched.resource.mimeType,
      originalName: fetched.resource.originalName
    });
    if (imported.status === 'error') {
      this.degradedByUrl.set(sourceUrl, imported.message);
      return null;
    }
    return {
      attachmentId: imported.attachment_id,
      markdownUrl: buildAssetMarkdownUrl(imported.attachment_id, imported.original_name),
      size: readImageIntrinsicSize(fetched.resource.bytes)
    };
  }
}
