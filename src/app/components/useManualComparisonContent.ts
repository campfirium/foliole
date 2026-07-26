import { useCallback, useRef, useState } from 'react';

export function useManualComparisonContent() {
  const [content, setContent] = useState('');
  const contentRef = useRef('');
  const reset = useCallback(() => {
    contentRef.current = '';
    setContent('');
  }, []);
  const update = useCallback((nextContent: string) => {
    contentRef.current = nextContent;
    setContent(nextContent);
  }, []);
  return { content, contentRef, reset, update };
}
