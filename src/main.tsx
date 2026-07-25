import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { bumpIncidentCounterTo } from './data/incidents';
import { loadSavedSession } from './lib/sessionSave';
import { setWizardAgentId } from './screens/wizard/wizardAgent';
import { bumpClaimCounterTo } from './store/claims';
import { initPriceFeed, useStore } from './store';
import './index.css';

// Restore a saved session (if any) BEFORE first render, so every screen
// mounts against the restored state. Id counters advance past restored ids
// so new claims/incidents never collide with saved ones.
const saved = loadSavedSession();
if (saved !== null) {
  useStore.setState(saved.data);
  setWizardAgentId(saved.wizardAgentId);
  const trailing = (id: string) => Number(id.split('-').pop()) || 0;
  bumpClaimCounterTo(Math.max(0, ...saved.data.claims.map((c) => trailing(c.id))));
  bumpIncidentCounterTo(Math.max(0, ...saved.data.incidents.map((i) => trailing(i.id))));
}

// First price fetch + 60 s refresh loop (REQ-6.2).
initPriceFeed();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
