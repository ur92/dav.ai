/**
 * Ignore Helpers - Utilities for filtering out ignored elements from DOM
 */

import { IGNORE_SELECTORS } from './ignore-selectors.js';

/**
 * Check if an element matches any of the ignore selectors
 * This function is used in the browser context to filter elements
 */
export function shouldIgnoreElement(element: HTMLElement, ignoreSelectors: string[]): boolean {
  // Check if element matches any ignore selector
  for (const selector of ignoreSelectors) {
    try {
      // Check if element matches the selector
      if (element.matches(selector)) {
        return true;
      }
      
      // Also check if element is a descendant of a matching element
      let parent: HTMLElement | null = element.parentElement;
      while (parent && parent !== document.body) {
        if (parent.matches(selector)) {
          return true;
        }
        parent = parent.parentElement;
      }
    } catch (e) {
      // Invalid selector, skip it
      continue;
    }
  }
  
  return false;
}

/**
 * Get ignore selectors for use in browser context
 */
export function getIgnoreSelectors(): string[] {
  return IGNORE_SELECTORS;
}

