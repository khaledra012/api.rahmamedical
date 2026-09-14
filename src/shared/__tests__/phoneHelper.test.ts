import { formatZatcaPhone } from '../helpers/phoneHelper';

describe('formatZatcaPhone (ZATCA BT-57 Rule)', () => {
  it('should return undefined for empty or invalid inputs', () => {
    expect(formatZatcaPhone(null)).toBeUndefined();
    expect(formatZatcaPhone(undefined)).toBeUndefined();
    expect(formatZatcaPhone('')).toBeUndefined();
    expect(formatZatcaPhone('   ')).toBeUndefined();
    expect(formatZatcaPhone('12')).toBeUndefined(); // less than 4 chars
  });

  it('should format international numbers lacking + prefix correctly (e.g., Qatar 974)', () => {
    expect(formatZatcaPhone('97433335294')).toBe('+97433335294');
    expect(formatZatcaPhone('974 3333 5294')).toBe('+97433335294');
    expect(formatZatcaPhone('974-3333-5294')).toBe('+97433335294');
  });

  it('should keep already compliant numbers with + prefix intact', () => {
    expect(formatZatcaPhone('+97433335294')).toBe('+97433335294');
    expect(formatZatcaPhone('+966512345678')).toBe('+966512345678');
  });

  it('should replace international prefix 00 with +', () => {
    expect(formatZatcaPhone('0097433335294')).toBe('+97433335294');
    expect(formatZatcaPhone('00966512345678')).toBe('+966512345678');
  });

  it('should keep standard local Saudi numbers starting with 0', () => {
    expect(formatZatcaPhone('0512345678')).toBe('0512345678');
    expect(formatZatcaPhone('050-123-4567')).toBe('0501234567');
  });

  it('should format 9-digit Saudi numbers starting with 5 to +9665...', () => {
    expect(formatZatcaPhone('512345678')).toBe('+966512345678');
    expect(formatZatcaPhone('501234567')).toBe('+966501234567');
  });

  it('should convert Arabic/Eastern digits (٠-٩) to English digits', () => {
    expect(formatZatcaPhone('٠٥٠١٢٣٤٥٦٧')).toBe('0501234567');
    expect(formatZatcaPhone('٩٧٤٣٣٣٣٥٢٩٤')).toBe('+97433335294');
  });

  it('should cap digits after prefix at 15 digits according to BT-57', () => {
    const longNum = '01234567890123456789';
    const result = formatZatcaPhone(longNum);
    expect(result).toBeDefined();
    expect(result!.length).toBe(16); // '0' + 15 digits
    expect(result!.startsWith('0')).toBe(true);
  });
});
