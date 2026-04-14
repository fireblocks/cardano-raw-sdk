/**
 * Sanitize sensitive data in objects for logging
 *
 * Recursively traverses objects and redacts values for keys that match
 * sensitive field patterns (e.g., password, apiKey, token, secret).
 *
 * @param data - The data to sanitize (can be object, array, or primitive)
 * @param customSensitiveKeys - Additional keys to treat as sensitive
 * @returns A deep copy of the data with sensitive values redacted
 *
 * @example
 * ```typescript
 * const data = {
 *   username: 'john',
 *   password: 'secret123',
 *   apiKey: 'sk_12345'
 * };
 *
 * sanitizeForLogging(data);
 * // Returns: { username: 'john', password: '[REDACTED]', apiKey: '[REDACTED]' }
 * ```
 */
export const sanitizeForLogging = (data: unknown, customSensitiveKeys: string[] = []): unknown => {
  // Common patterns for sensitive field names
  const defaultSensitivePatterns = [
    /password/i,
    /passwd/i,
    /pwd/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /apikey/i,
    /private[_-]?key/i,
    /privatekey/i,
    /auth/i,
    /credential/i,
    /bearer/i,
    /authorization/i,
    /cookie/i,
    /session/i,
    /ssn/i,
    /social[_-]?security/i,
    /credit[_-]?card/i,
    /card[_-]?number/i,
    /cvv/i,
    /pin/i,
  ];

  // Check if a key matches any sensitive pattern
  const isSensitiveKey = (key: string): boolean => {
    const lowerKey = key.toLowerCase();

    // Check custom keys (exact match)
    if (customSensitiveKeys.some((k) => k.toLowerCase() === lowerKey)) {
      return true;
    }

    // Check default patterns
    return defaultSensitivePatterns.some((pattern) => pattern.test(key));
  };

  // Handle null/undefined
  if (data == null) {
    return data;
  }

  // Handle primitive types
  if (typeof data !== "object") {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLogging(item, customSensitiveKeys));
  }

  // Handle objects
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeForLogging(value, customSensitiveKeys);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};
