import { useEffect, useState } from 'react';

// Minimal hash-based router for manual preview access only — not a general
// navigation system. Real in-app navigation still uses each workspace's own screen
// state (see GroupsWorkspace, WhatIfSimulator). This exists so a standalone page like
// the what-if simulator or the bank connection screens can be opened by typing the
// hash in the URL bar before it's wired into the tab flow.
export const previewRoutes = {
  simulator: '/preview/simulator',
  banking: '/preview/banking',
} as const;

export type PreviewRoute = typeof previewRoutes[keyof typeof previewRoutes];

const normalize = (hash: string) => hash.replace(/^#/, '');

export function useHashRoute(): string {
  const [route, setRoute] = useState(() => normalize(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setRoute(normalize(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return route;
}

export const clearRoute = () => { window.location.hash = ''; };
