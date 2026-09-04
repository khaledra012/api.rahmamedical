/**
 * Sensitive fields to mask in payloads and headers
 */
const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /authorization/i,
  /bearer/i,
  /token/i,
  /password/i,
  /secret/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /client[-_]?secret/i,
];

/**
 * Checks if an object key contains sensitive credentials
 */
const isSensitiveKey = (key: string): boolean => {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
};

/**
 * Deeply sanitizes an object or array by masking sensitive credentials
 * and preventing stack overflow via WeakSet circular reference tracking.
 *
 * @param data The data to sanitize (object, array, primitive)
 * @param seen WeakSet to track visited objects and prevent circular reference loops
 * @returns A safe, masked copy of the data
 */
export const sanitizeLogPayload = (data: any, seen: WeakSet<object> = new WeakSet()): any => {
  // Handle primitives and null/undefined
  if (data === null || data === undefined || typeof data !== 'object') {
    // If it's a string that looks like a raw Bearer token, mask it
    if (typeof data === 'string' && /^bearer\s+[a-zA-Z0-9._\-+/=]+$/i.test(data.trim())) {
      return 'Bearer ***MASKED***';
    }
    return data;
  }

  // Handle circular references
  if (seen.has(data)) {
    return '[Circular Reference]';
  }
  seen.add(data);

  // Handle Date objects
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Handle Error objects
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogPayload(item, seen));
  }

  // Handle plain objects
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '***MASKED***';
    } else {
      sanitized[key] = sanitizeLogPayload(value, seen);
    }
  }

  return sanitized;
};
