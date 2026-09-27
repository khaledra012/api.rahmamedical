// Common valid Top-Level Domains (TLDs) used in Saudi Arabia and global e-commerce
const RECOGNIZED_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
  'sa', 'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'edu.sa', 'med.sa',
  'ae', 'eg', 'kw', 'bh', 'om', 'qa', 'jo', 'lb',
  'co', 'io', 'ai', 'me', 'info', 'biz', 'app', 'dev', 'cloud',
  'online', 'store', 'shop', 'site', 'tech', 'xyz', 'icu',
  'uk', 'co.uk', 'us', 'ca', 'de', 'fr', 'ru', 'cn', 'in', 'jp',
]);

/**
 * Email validation and sanitization helper
 * Ensures emails sent to Daftra ERP comply with strict ZATCA & RFC email syntax.
 * If a customer enters random letters or invalid domain in the email field (e.g. uugfhjjh@hjh.nhhj),
 * it cleanly falls back to the store fallback email (orders@rahmamedical.online)
 * so ZATCA never rejects the invoice.
 */
export const sanitizeEmail = (
  email?: string | null,
  fallback: string = 'orders@rahmamedical.online'
): string => {
  if (!email || typeof email !== 'string') {
    return fallback;
  }

  const trimmed = email.trim().toLowerCase();

  // Basic structure check
  const parts = trimmed.split('@');
  if (parts.length !== 2) return fallback;
  const [local, domain] = parts;
  if (!local || !domain || local.length > 64 || domain.length > 255) return fallback;

  // Domain must contain at least one dot
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return fallback;

  // Verify TLD is valid and recognized
  const multiPartTld = domainParts.slice(-2).join('.'); // e.g. com.sa
  const simpleTld = domainParts[domainParts.length - 1]; // e.g. com, sa

  if (!RECOGNIZED_TLDS.has(multiPartTld) && !RECOGNIZED_TLDS.has(simpleTld)) {
    return fallback;
  }

  // Standard email format validation regex
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (emailRegex.test(trimmed)) {
    return trimmed;
  }

  return fallback;
};

