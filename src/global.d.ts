declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      partition?: string;
      src?: string;
    };
  }
}

interface Window {
  turnstile?: {
    render: (
      element: HTMLElement,
      options: {
        callback: (token: string) => void;
        'error-callback': () => void;
        sitekey: string;
      }
    ) => string;
  };
}
