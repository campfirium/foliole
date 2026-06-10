import React from 'react';
import ReactDOM from 'react-dom/client';

import { WebGuidesApp } from './WebGuidesApp';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in Web Guides entry.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WebGuidesApp />
  </React.StrictMode>
);
