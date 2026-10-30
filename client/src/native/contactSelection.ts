import { Contacts } from '@capacitor/contacts';
import { Capacitor } from '@capacitor/core';

type WebContact = { email?: string[]; tel?: string[] };
type ContactNavigator = Navigator & {
  contacts?: {
    select: (properties: ('email' | 'tel')[], options: { multiple: boolean }) => Promise<WebContact[]>;
  };
};

export type ContactIdentifiers = { emails: string[]; phones: string[] };

export class ContactSelectionUnavailableError extends Error {
  constructor() {
    super('Contact selection is not available on this device.');
    this.name = 'ContactSelectionUnavailableError';
  }
}

const uniqueValues = (values: Array<string | undefined>) => [...new Set(values
  .map(value => value?.trim())
  .filter((value): value is string => Boolean(value)))];

const isCancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
  || typeof error === 'object' && error !== null && 'code' in error && error.code === 'OS-PLUG-CONT-0006';

/**
 * Opens the platform contact picker without reading or storing the address book.
 * Native iOS intentionally picks one contact at a time; the browser picker may
 * return several contacts when the browser supports the Contact Picker API.
 */
export const selectContactIdentifiers = async (): Promise<ContactIdentifiers | null> => {
  if (Capacitor.isNativePlatform()) {
    try {
      const contact = await Contacts.pickContact();
      return {
        emails: uniqueValues(contact.emails?.map(field => field.value) ?? []),
        phones: uniqueValues(contact.phoneNumbers?.map(field => field.value) ?? []),
      };
    } catch (error) {
      if (isCancelled(error)) return null;
      throw error;
    }
  }

  const contacts = (navigator as ContactNavigator).contacts;
  if (!contacts) throw new ContactSelectionUnavailableError();
  try {
    const selected = await contacts.select(['email', 'tel'], { multiple: true });
    return {
      emails: uniqueValues(selected.flatMap(contact => contact.email ?? [])),
      phones: uniqueValues(selected.flatMap(contact => contact.tel ?? [])),
    };
  } catch (error) {
    if (isCancelled(error)) return null;
    throw error;
  }
};
