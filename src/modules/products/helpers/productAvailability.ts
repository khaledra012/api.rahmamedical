/**
 * Daftra has used both spellings of this field across API versions.
 * Missing data is treated as available for backwards compatibility with
 * older webhook payloads that did not include the online-availability flag.
 */
export function isDaftraProductAvailableOnline(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return true;

  const rawValue =
    payload.availabe_online ??
    payload.available_online ??
    payload.availableOnline;

  if (rawValue === undefined || rawValue === null || rawValue === '') return true;
  if (typeof rawValue === 'boolean') return rawValue;
  if (typeof rawValue === 'number') return rawValue === 1;

  const normalized = String(rawValue).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}
