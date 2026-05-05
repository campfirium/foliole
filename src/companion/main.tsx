import React from 'react';
import ReactDOM from 'react-dom/client';

import '../app/styles.css';
import { CompanionApp } from './CompanionApp';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in companion entry.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <CompanionApp />
  </React.StrictMode>
);
