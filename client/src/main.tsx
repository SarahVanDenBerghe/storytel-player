import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ReadingPopout from './components/ReadingPopout';
import './i18n';

// The read-along pop-out window loads this same page with ?readAlongPopout=<bookId>.
const popoutBookId = new URLSearchParams(window.location.search).get('readAlongPopout');

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    {popoutBookId ? <ReadingPopout initialBookId={popoutBookId} /> : <App />}
  </React.StrictMode>
);
