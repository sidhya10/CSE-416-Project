import { useEffect, useSyncExternalStore } from 'react';

export type Appearance = 'System' | 'Light' | 'Dark';
export const appearanceKey = 'cse416.appearance.v1';
const eventName = 'cse416:appearance';
let fallback: Appearance = 'System';

export function readAppearance(): Appearance {
  try {
    const saved = localStorage.getItem(appearanceKey);
    return saved === 'Light' || saved === 'Dark' || saved === 'System' ? saved : 'System';
  } catch { return fallback; }
}

export function applyAppearance(preference: Appearance) {
  const dark = preference === 'Dark' || preference === 'System' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
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
  const preference = useSyncExternalStore(subscribe, readAppearance, () => 'System' as const);
  return [preference, setAppearance] as const;
}

export function useApplyAppearance() {
  const [preference] = useAppearance();
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => applyAppearance(preference);
    update();
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, [preference]);
}
