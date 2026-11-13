import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export function checkCsvExportSupport() {
  if (Capacitor.isNativePlatform() && (!Capacitor.isPluginAvailable('Filesystem') || !Capacitor.isPluginAvailable('Share'))) {
    throw new Error('Update the app in TestFlight to export files, or export from the website in Safari.');
  }
}

export async function saveCsv(blob: Blob, filename: string) {
  checkCsvExportSupport();
  if (Capacitor.isNativePlatform()) {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const directory = `budget-exports/${crypto.randomUUID()}`;
    const path = `${directory}/${safeName}`;
    await Filesystem.mkdir({ path: directory, directory: Directory.Cache, recursive: true });
    try {
      const file = await Filesystem.writeFile({ path, directory: Directory.Cache, data: await blob.text(), encoding: Encoding.UTF8 });
      await Share.share({ title: 'Personal budget', files: [file.uri], dialogTitle: 'Save or share budget CSV' });
    } catch (error) {
      const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
      if (!/cancel/i.test(message)) throw error;
    } finally {
      // Keep private budget data only while the share sheet is using it.
      await Filesystem.rmdir({ path: directory, directory: Directory.Cache, recursive: true }).catch(() => {});
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); }
  finally {
    link.remove();
    // Mobile browsers may consume the URL asynchronously after the click.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
