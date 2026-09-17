import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { markUpdatePending } from './app/update';
import './ui/styles.css';

// A new version is applied on the next launch or the next time the app is hidden (see update.ts),
// never in the middle of a workout.
registerSW({ immediate: true, onNeedReload: markUpdatePending });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
