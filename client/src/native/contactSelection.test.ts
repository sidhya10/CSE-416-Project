import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nativePlatform, pickContact } = vi.hoisted(() => ({
  nativePlatform: vi.fn(),
  pickContact: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: nativePlatform } }));
vi.mock('@capacitor/contacts', () => ({ Contacts: { pickContact } }));

import { ContactSelectionUnavailableError, selectContactIdentifiers } from './contactSelection';

describe('contact selection', () => {
  beforeEach(() => {
    nativePlatform.mockReset();
    pickContact.mockReset();
    Reflect.deleteProperty(navigator, 'contacts');
  });

  it('uses the native picker and returns only unique email and phone identifiers', async () => {
    nativePlatform.mockReturnValue(true);
    pickContact.mockResolvedValue({
      emails: [{ value: 'friend@example.com' }, { value: ' friend@example.com ' }],
      phoneNumbers: [{ value: '+1 (631) 555-0100' }, { value: '' }],
    });

    await expect(selectContactIdentifiers()).resolves.toEqual({
      emails: ['friend@example.com'],
      phones: ['+1 (631) 555-0100'],
    });
  });

  it('treats cancelling the native picker as no selection', async () => {
    nativePlatform.mockReturnValue(true);
    pickContact.mockRejectedValue({ code: 'OS-PLUG-CONT-0006' });
    await expect(selectContactIdentifiers()).resolves.toBeNull();
  });

  it('uses the browser contact picker when available', async () => {
    nativePlatform.mockReturnValue(false);
    Object.defineProperty(navigator, 'contacts', { configurable: true, value: {
      select: vi.fn().mockResolvedValue([
        { email: ['one@example.com'], tel: ['111'] },
        { email: ['two@example.com'], tel: ['222'] },
      ]),
    } });
    await expect(selectContactIdentifiers()).resolves.toEqual({
      emails: ['one@example.com', 'two@example.com'], phones: ['111', '222'],
    });
  });

  it('reports unsupported web browsers without requesting contacts', async () => {
    nativePlatform.mockReturnValue(false);
    await expect(selectContactIdentifiers()).rejects.toBeInstanceOf(ContactSelectionUnavailableError);
  });
});
