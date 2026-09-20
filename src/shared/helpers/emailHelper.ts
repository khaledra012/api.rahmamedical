/**
 * Email validation and sanitization helper
 * Ensures emails sent to Daftra ERP comply with strict email syntax.
 * If a customer enters random letters or invalid text in the email field,
 * it falls back cleanly to the store fallback email.
 */
export const sanitizeEmail = (
  email?: string | null,
  fallback: string = 'orders@rahmamedical.online'
): string => {
  if (!email || typeof email !== 'string') {
    return fallback;
  }

  const trimmed = email.trim().toLowerCase();

  // Standard email format validation regex
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (emailRegex.test(trimmed)) {
    return trimmed;
  }

  return fallback;
};
