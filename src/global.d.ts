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
