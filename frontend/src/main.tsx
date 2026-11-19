import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@xyflow/react/dist/style.css';
import './render/styles.css';

import App from './App';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('root element is missing');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
