declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      allowpopups?: 'false';
      disablewebsecurity?: 'false';
      nodeintegration?: 'false';
      partition?: string;
      referrerpolicy?: 'no-referrer';
      src?: string;
      webpreferences?: string;
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
