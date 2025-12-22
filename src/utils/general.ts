/**
 * General Utilities
 *
 * This file is a placeholder for general-purpose utility functions that don't fit
 * into more specific utility files.
 *
 * Common utilities you might add here:
 * - Data transformation functions
 * - String manipulation helpers
 * - Array/Object utilities
 * - Formatting functions
 * - Validation helpers
 * - Common calculations
 *
 * Guidelines:
 * - Keep functions pure and side-effect free when possible
 * - Add comprehensive JSDoc documentation for each function
 * - Include usage examples in documentation
 * - Export all functions for use throughout the application
 * - Consider TypeScript generics for reusable logic
 *
 * Example utilities:
 * ```typescript
 * // Delay execution for a specified time
 * export const sleep = (ms: number): Promise<void> => {
 *   return new Promise(resolve => setTimeout(resolve, ms));
 * };
 *
 * // Retry a function with exponential backoff
 * export async function retryWithBackoff<T>(
 *   fn: () => Promise<T>,
 *   maxRetries: number = 3,
 *   baseDelay: number = 1000
 * ): Promise<T> {
 *   for (let i = 0; i < maxRetries; i++) {
 *     try {
 *       return await fn();
 *     } catch (error) {
 *       if (i === maxRetries - 1) throw error;
 *       await sleep(baseDelay * Math.pow(2, i));
 *     }
 *   }
 *   throw new Error('Max retries exceeded');
 * }
 *
 * // Format a number as currency
 * export const formatCurrency = (
 *   amount: number,
 *   currency: string = 'USD'
 * ): string => {
 *   return new Intl.NumberFormat('en-US', {
 *     style: 'currency',
 *     currency
 *   }).format(amount);
 * };
 *
 * // Deep clone an object
 * export const deepClone = <T>(obj: T): T => {
 *   return JSON.parse(JSON.stringify(obj));
 * };
 *
 * // Check if value is empty (null, undefined, empty string, empty array, empty object)
 * export const isEmpty = (value: any): boolean => {
 *   if (value == null) return true;
 *   if (typeof value === 'string') return value.trim().length === 0;
 *   if (Array.isArray(value)) return value.length === 0;
 *   if (typeof value === 'object') return Object.keys(value).length === 0;
 *   return false;
 * };
 * ```
 */

// Add your general utility functions below this line
