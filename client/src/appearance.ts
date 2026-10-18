import { useEffect, useSyncExternalStore } from 'react';

export type Appearance = 'Light' | 'Dark';
export const appearanceKey = 'cse416.appearance.v1';
const eventName = 'cse416:appearance';
let fallback: Appearance = 'Light';

export function readAppearance(): Appearance {
  try {
    const saved = localStorage.getItem(appearanceKey);
    return saved === 'Dark' ? 'Dark' : 'Light';
  } catch { return fallback; }
}

export function applyAppearance(preference: Appearance) {
  const dark = preference === 'Dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setAppearance(preference: Appearance) {
  fallback = preference;
  try { localStorage.setItem(appearanceKey, preference); } catch { /* Still works when storage is unavailable. */ }
  applyAppearance(preference);
  window.dispatchEvent(new Event(eventName));
}

function subscribe(onChange: () => void) {
  const storageChange = (event: StorageEvent) => {
    if (event.key === appearanceKey || event.key === null) onChange();
  };
  window.addEventListener(eventName, onChange);
  window.addEventListener('storage', storageChange);
  return () => {
    window.removeEventListener(eventName, onChange);
    window.removeEventListener('storage', storageChange);
  };
}

export function useAppearance() {
  const preference = useSyncExternalStore(subscribe, readAppearance, () => 'Light' as const);
  return [preference, setAppearance] as const;
}

export function useApplyAppearance() {
  const [preference] = useAppearance();
  useEffect(() => { applyAppearance(preference); }, [preference]);
}
