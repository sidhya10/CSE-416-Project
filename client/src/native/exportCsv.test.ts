import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: vi.fn(), available: vi.fn(), write: vi.fn(), mkdir: vi.fn(), rmdir: vi.fn(), share: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.native, isPluginAvailable: mocks.available } }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' }, Filesystem: { writeFile: mocks.write, mkdir: mocks.mkdir, rmdir: mocks.rmdir } }));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));
import { saveCsv } from './exportCsv';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockReturnValue(true); mocks.available.mockReturnValue(true);
  mocks.mkdir.mockResolvedValue(undefined); mocks.rmdir.mockResolvedValue(undefined);
  mocks.write.mockResolvedValue({ uri: 'file:///cache/budget.csv' }); mocks.share.mockResolvedValue({});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const csv = { text: async () => 'Date,Amount\r\n2026-11-01,12.00' } as Blob;

describe('CSV export', () => {
  it('shares a real native file and keeps it until the share sheet finishes', async () => {
    let finish!: () => void;
    mocks.share.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = saveCsv(csv, 'budget.csv');
    await vi.waitFor(() => expect(mocks.share).toHaveBeenCalled());
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ data: await csv.text(), encoding: 'utf8', directory: 'CACHE' }));
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/budget.csv'] }));
    expect(mocks.rmdir).not.toHaveBeenCalled();
    finish(); await pending;
    expect(mocks.rmdir).toHaveBeenCalledOnce();
  });
  it('explains when an older native build needs an update', async () => {
    mocks.available.mockReturnValue(false);
    await expect(saveCsv(csv, 'budget.csv')).rejects.toThrow('Update the app in TestFlight');
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('cleans up after cancellation without showing an error', async () => {
    mocks.share.mockRejectedValue({ message: 'Share canceled' });
    await expect(saveCsv(csv, 'budget.csv')).resolves.toBeUndefined();
    expect(mocks.rmdir).toHaveBeenCalledOnce();
  });
  it('surfaces real share failures and cleans up', async () => {
    mocks.share.mockRejectedValue(new Error('Could not share file'));
    await expect(saveCsv(csv, 'budget.csv')).rejects.toThrow('Could not share file');
    expect(mocks.rmdir).toHaveBeenCalledOnce();
  });
  it('keeps browser download URLs alive long enough to be opened', async () => {
    mocks.native.mockReturnValue(false); vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:csv'), revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await saveCsv(csv, 'budget.csv');
    expect(click).toHaveBeenCalledOnce(); expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(revoke).toHaveBeenCalledWith('blob:csv');
  });
});
