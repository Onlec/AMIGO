import { startSync } from './data/sync.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Geen <React.StrictMode> hier: HomePage injecteert een echt uitvoerend
// <script>-element (zie HomePage.jsx) dat zijn eigen globale event-
// listeners en SVG-opbouw beheert. StrictMode's dev-only dubbele
// mount/unmount zou dat script twee keer laten draaien tegen dezelfde
// pagina — onschuldig in productie (StrictMode doet daar toch niets),
// maar verwarrend tijdens lokaal ontwikkelen.
ReactDOM.createRoot(document.getElementById('root')).render(<App />);

startSync();
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
    .catch(error => console.warn('Offline opstarten is niet beschikbaar.', error));
}
