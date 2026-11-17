import { useLayoutEffect, useRef } from 'react';

import type { MarkdownImagePreviewRequest } from '../model/markdownImagePreview';

export function MarkdownImagePreviewSelection(props: {
  mountEditor: NonNullable<MarkdownImagePreviewRequest['mountEditor']>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const annotationHost = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => props.mountEditor(host.current!, annotationHost.current!), [props.mountEditor]);
  return <>
    <div ref={host} className="cm-md-image-preview-selection" />
    <div ref={annotationHost} data-image-preview-annotation-host />
  </>;
}
