import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ReadingPopout from './components/ReadingPopout';
import ReadingBubble from './components/ReadingBubble';
import './i18n';

// The read-along pop-out window loads this same page with ?readAlongPopout=<bookId>,
// and its minimized bubble with ?readAlongBubble=1.
const params = new URLSearchParams(window.location.search);
const popoutBookId = params.get('readAlongPopout');
const isBubble = params.has('readAlongBubble');

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    {isBubble ? <ReadingBubble /> : popoutBookId ? <ReadingPopout initialBookId={popoutBookId} /> : <App />}
  </React.StrictMode>
);
