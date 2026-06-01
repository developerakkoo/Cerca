export interface PhoneDialContact {
  callPhoneNumber?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
}

/** Resolves a phone number suitable for tel: links. Prefers callPhoneNumber from API. */
export function phoneForDial(contact?: PhoneDialContact | null): string | null {
  if (!contact) return null;
  const candidates = [
    contact.callPhoneNumber,
    contact.phone,
    contact.phoneNumber,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    if (raw.includes('*')) continue;
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 10) return digits;
  }
  return null;
}
