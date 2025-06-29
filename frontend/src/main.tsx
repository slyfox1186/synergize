import ReactDOM from 'react-dom/client';
import { MathJaxContext } from 'better-react-mathjax';

import App from './App.tsx';
import { mathJaxConfig } from './config/mathJaxConfig.ts';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <MathJaxContext version={3} config={mathJaxConfig}>
    <App />
  </MathJaxContext>
);