import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import ConnectedAccounts from './pages/banking/ConnectedAccounts';
import WhatIfSimulator from './pages/budgets/WhatIfSimulator';
import { clearRoute, previewRoutes, useHashRoute } from './router';
import './styles.css';

// Preview-only routing: visit #/preview/simulator or #/preview/banking directly in
// the URL bar to open a standalone page before it's wired into the tab flow.
// No links point here yet — this is manual-access only.
function Root() {
  const route = useHashRoute();
  if (route === previewRoutes.simulator) return <div className="device"><WhatIfSimulator onBack={clearRoute} /></div>;
  if (route === previewRoutes.banking) return <div className="device"><ConnectedAccounts onBack={clearRoute} /></div>;
  return <App />;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
