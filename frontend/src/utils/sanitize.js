/**
 * Input sanitization utilities for form data
 */

/**
 * Sanitize a string by trimming whitespace and removing potentially dangerous characters
 * @param {string} str - The string to sanitize
 * @returns {string} - The sanitized string
 */
export const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;

  return str
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

/**
 * Sanitize HTML to prevent XSS attacks
 * @param {string} str - The string to sanitize
 * @returns {string} - The sanitized string with HTML entities escaped
 */
export const sanitizeHtml = (str) => {
  if (typeof str !== 'string') return str;

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Sanitize an email address
 * @param {string} email - The email to sanitize
 * @returns {string} - The sanitized email
 */
export const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return email;

  return email
    .trim()
    .toLowerCase()
    // Remove any characters that aren't valid in emails
    .replace(/[^\w.@+-]/g, '');
};

/**
 * Sanitize a phone number
 * @param {string} phone - The phone number to sanitize
 * @returns {string} - The sanitized phone number
 */
export const sanitizePhone = (phone) => {
  if (typeof phone !== 'string') return phone;

  return phone
    .trim()
    // Keep only digits, spaces, dashes, parentheses, and plus sign
    .replace(/[^\d\s\-().+]/g, '');
};

/**
 * Sanitize a numeric value
 * @param {string|number} value - The value to sanitize
 * @returns {string} - The sanitized numeric string
 */
export const sanitizeNumber = (value) => {
  if (typeof value === 'number') return value.toString();
  if (typeof value !== 'string') return value;

  return value
    .trim()
    // Keep only digits, decimal point, and minus sign
    .replace(/[^\d.-]/g, '');
};

/**
 * Sanitize a date string
 * @param {string} date - The date to sanitize
 * @returns {string} - The sanitized date string
 */
export const sanitizeDate = (date) => {
  if (typeof date !== 'string') return date;

  return date
    .trim()
    // Keep only digits, dashes, colons, and T for ISO format
    .replace(/[^\d\-:T]/g, '');
};

/**
 * Sanitize form data object by applying appropriate sanitization to each field
 * @param {Object} data - The form data object
 * @param {Object} fieldTypes - Object mapping field names to their types
 * @returns {Object} - The sanitized form data
 */
export const sanitizeFormData = (data, fieldTypes = {}) => {
  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === '') {
      sanitized[key] = value;
      continue;
    }

    const fieldType = fieldTypes[key] || 'string';

    switch (fieldType) {
      case 'email':
        sanitized[key] = sanitizeEmail(value);
        break;
      case 'phone':
        sanitized[key] = sanitizePhone(value);
        break;
      case 'number':
        sanitized[key] = sanitizeNumber(value);
        break;
      case 'date':
        sanitized[key] = sanitizeDate(value);
        break;
      case 'html':
        sanitized[key] = sanitizeHtml(value);
        break;
      case 'text':
      case 'string':
      default:
        sanitized[key] = sanitizeString(value);
        break;
    }
  }

  return sanitized;
};

/**
 * Validate and sanitize an email address
 * @param {string} email - The email to validate
 * @returns {Object} - { isValid: boolean, value: string, error?: string }
 */
export const validateEmail = (email) => {
  const sanitized = sanitizeEmail(email);

  if (!sanitized) {
    return { isValid: true, value: sanitized }; // Empty is valid (optional field)
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    return { isValid: false, value: sanitized, error: 'Invalid email format' };
  }

  return { isValid: true, value: sanitized };
};

/**
 * Validate and sanitize a phone number
 * @param {string} phone - The phone to validate
 * @returns {Object} - { isValid: boolean, value: string, error?: string }
 */
export const validatePhone = (phone) => {
  const sanitized = sanitizePhone(phone);

  if (!sanitized) {
    return { isValid: true, value: sanitized }; // Empty is valid (optional field)
  }

  // At least 7 digits for a valid phone number
  const digitsOnly = sanitized.replace(/\D/g, '');
  if (digitsOnly.length < 7) {
    return { isValid: false, value: sanitized, error: 'Phone number too short' };
  }

  return { isValid: true, value: sanitized };
};

/**
 * Validate a required field
 * @param {any} value - The value to validate
 * @param {string} fieldName - The field name for error message
 * @returns {Object} - { isValid: boolean, error?: string }
 */
export const validateRequired = (value, fieldName) => {
  if (value === null || value === undefined || value === '' ||
      (typeof value === 'string' && value.trim() === '')) {
    return { isValid: false, error: `${fieldName} is required` };
  }
  return { isValid: true };
};

/**
 * Validate amount/currency value
 * @param {string|number} value - The value to validate
 * @returns {Object} - { isValid: boolean, value: number, error?: string }
 */
export const validateAmount = (value) => {
  const sanitized = sanitizeNumber(value);
  const num = parseFloat(sanitized);

  if (isNaN(num)) {
    return { isValid: false, value: 0, error: 'Invalid amount' };
  }

  if (num < 0) {
    return { isValid: false, value: num, error: 'Amount cannot be negative' };
  }

  return { isValid: true, value: num };
};
