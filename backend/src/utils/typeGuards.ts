/**
 * Type guard utilities for safer error handling and type checking
 */

/**
 * Type guard to check if a value is an Error instance
 * Handles both native Error instances and Error-like objects
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error || 
    (typeof value === 'object' && 
     value !== null && 
     'message' in value && 
     'name' in value &&
     typeof (value as Record<string, unknown>).message === 'string' &&
     typeof (value as Record<string, unknown>).name === 'string');
}

/**
 * Type guard to safely extract error message from unknown value
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  // Handle objects with toString method
  if (error && typeof error === 'object' && 'toString' in error) {
    const str = String(error);
    if (str !== '[object Object]') {
      return str;
    }
  }
  
  return 'An unknown error occurred';
}

/**
 * Type guard to check if a value is a NodeJS.ErrnoException
 */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return isError(error) && ('code' in error || 'errno' in error);
}

/**
 * Type guard to check if error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (!isError(error)) return false;
  
  const message = error.message.toLowerCase();
  return message.includes('timeout') || 
         message.includes('timed out') ||
         (isNodeError(error) && error.code === 'ETIMEDOUT');
}

/**
 * Type guard to check if error is a connection error
 */
export function isConnectionError(error: unknown): boolean {
  if (!isError(error)) return false;
  
  const message = error.message.toLowerCase();
  return message.includes('connection') || 
         message.includes('econnrefused') ||
         message.includes('enotfound') ||
         (isNodeError(error) && ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(error.code || ''));
}

/**
 * Type guard for checking if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for checking if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard for checking if a value is a valid number (not NaN)
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard for checking if a value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && 
         typeof value === 'object' && 
         value.constructor === Object &&
         !Array.isArray(value);
}

/**
 * Type guard for checking if object has a specific property
 */
export function hasProperty<K extends PropertyKey>(
  obj: unknown,
  prop: K
): obj is Record<K, unknown> {
  return isPlainObject(obj) && prop in obj;
}

/**
 * Type guard for safe array type checking
 */
export function isArray<T>(value: unknown, itemGuard?: (item: unknown) => item is T): value is T[] {
  if (!Array.isArray(value)) return false;
  
  if (itemGuard) {
    return value.every(itemGuard);
  }
  
  return true;
}

/**
 * Safely parse JSON with type guard
 */
export function safeJsonParse<T = unknown>(
  json: string,
  guard?: (value: unknown) => value is T
): T | null {
  try {
    const parsed = JSON.parse(json);
    if (guard && !guard(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

/**
 * Create a type guard for enum values
 */
export function createEnumGuard<T extends Record<string, string | number>>(
  enumObj: T
): (value: unknown) => value is T[keyof T] {
  const values = Object.values(enumObj);
  return (value: unknown): value is T[keyof T] => {
    return values.includes(value as T[keyof T]);
  };
}