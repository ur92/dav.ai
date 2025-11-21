import { Browser, Page, chromium } from 'playwright';
import { SimplifiedElement } from '../types/state.js';
import { createHash } from 'crypto';
import { IGNORE_SELECTORS } from '../agent/helpers/ignore-selectors.js';

/**
 * BrowserTools - Handles all browser automation operations
 */
export class BrowserTools {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private headless: boolean;

  constructor(headless: boolean = true) {
    this.headless = headless;
  }

  /**
   * Initialize browser and create a new page
   */
  async initialize(): Promise<void> {
    const windowWidth = 1200;
    // Use 16:9 aspect ratio (common modern display ratio)
    const windowHeight = Math.round(windowWidth * 9 / 16); // 675
    
    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        `--window-size=${windowWidth},${windowHeight}`,
        `--window-position=0,0`,
      ],
    });
    this.page = await this.browser.newPage();
    // Set viewport to match window size
    await this.page.setViewportSize({ width: windowWidth, height: windowHeight });
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Observe state - Navigate to URL and extract Simplified/Structured DOM
   * This is critical for minimizing LLM token cost and focusing attention
   */
  async observe(url?: string, sessionId?: string, stepIndex?: number): Promise<{ domState: string; currentUrl: string; fingerprint: string }> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    // Navigate to the URL if provided, otherwise observe current page
    if (url) {
      try {
        await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      } catch (error: any) {
        // Handle connection errors more gracefully
        if (error.message?.includes('ERR_CONNECTION_REFUSED') || error.message?.includes('net::ERR_CONNECTION_REFUSED')) {
          throw new Error(
            `Connection refused: Unable to connect to ${url}. ` +
            `Please ensure the development server is running. ` +
            `For test-app, run: yarn dev:test-app`
          );
        }
        // Re-throw other errors
        throw error;
      }
    }
    const finalUrl = this.page.url();

    // Extract simplified DOM using page.evaluate()
    // Note: This code runs in the browser context where DOM types are available
    // Using string-based evaluation to avoid TypeScript metadata injection
    // Pass ignore selectors as JSON string to avoid serialization issues
    const ignoreSelectorsJson = JSON.stringify(IGNORE_SELECTORS);
    const evaluateCode = `
      (function() {
        const elements = [];
        const ignoreSelectors = ${ignoreSelectorsJson};
        
        function shouldIgnoreElement(element) {
          for (var i = 0; i < ignoreSelectors.length; i++) {
            var selector = ignoreSelectors[i];
            try {
              if (element.matches(selector)) {
                return true;
              }
              var parent = element.parentElement;
              while (parent && parent !== document.body) {
                if (parent.matches(selector)) {
                  return true;
                }
                parent = parent.parentElement;
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
        
        function isElementVisible(element) {
          // Check aria-hidden attribute on the element itself
          if (element.getAttribute('aria-hidden') === 'true') {
            return false;
          }
          
          // Check element and all parent elements for visibility
          let current = element;
          while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            
            // Check display: none
            if (style.display === 'none') {
              return false;
            }
            
            // Check visibility: hidden
            if (style.visibility === 'hidden') {
              return false;
            }
            
            // Check opacity: 0 or very low (less than 0.01)
            const opacity = parseFloat(style.opacity || '1');
            if (opacity < 0.01) {
              return false;
            }
            
            // Check if parent has aria-hidden
            if (current.getAttribute('aria-hidden') === 'true') {
              return false;
            }
            
            current = current.parentElement;
          }
          
          // Check if element has zero dimensions (effectively invisible)
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            return false;
          }
          
          // Check if element is completely outside viewport
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
          
          // Element is outside viewport if all edges are outside
          if (rect.right < 0 || rect.left > viewportWidth || 
              rect.bottom < 0 || rect.top > viewportHeight) {
            return false;
          }
          
          // Check offsetParent (handles elements with display: none, position: fixed with no positioning,
          // or elements that are not in the document flow)
          if (element.offsetParent === null) {
            // Exception: position: fixed elements can have offsetParent === null but still be visible
            const elementStyle = window.getComputedStyle(element);
            if (elementStyle.position !== 'fixed') {
              return false;
            }
          }
          
          return true;
        }
        
        function isInModal(element) {
          let current = element;
          while (current && current !== document.body) {
            const role = current.getAttribute('role');
            const ariaModal = current.getAttribute('aria-modal');
            const className = current.className || '';
            const classStr = String(className).toLowerCase();
            const style = window.getComputedStyle(current);
            
            if (role === 'dialog' && ariaModal === 'true') {
              return true;
            }
            
            if (classStr.includes('dialog') || 
                classStr.includes('modal') || 
                classStr.includes('overlay') ||
                classStr.includes('popup')) {
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                return true;
              }
            }
            
            const zIndex = parseInt(style.zIndex || '0', 10);
            if (zIndex > 1000 && style.position !== 'static') {
              return true;
            }
            
            current = current.parentElement;
          }
          return false;
        }
        
        const selectors = [
          'a[href]', 'button', 'input', 'textarea',
          '[role="button"]', '[role="link"]', 'select', '[onclick]',
          'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
        ];
        
        selectors.forEach(function(selector) {
          const nodes = document.querySelectorAll(selector);
          nodes.forEach(function(node) {
            const element = node;
            
            // Skip ignored elements
            if (shouldIgnoreElement(element)) {
              return;
            }
            
            // Skip hidden elements (display: none, visibility: hidden, opacity: 0, outside viewport, etc.)
            if (!isElementVisible(element)) {
              return;
            }
            
            let text = '';
            let selectorStr = '';
            
            if (element.textContent) {
              text = element.textContent.trim().substring(0, 30);
            } else if (element.getAttribute('aria-label')) {
              text = element.getAttribute('aria-label').substring(0, 30);
            } else if (element.getAttribute('placeholder')) {
              text = element.getAttribute('placeholder').substring(0, 30);
            } else if (element.getAttribute('title')) {
              text = element.getAttribute('title').substring(0, 30);
            }
            
            // Prioritize most specific selectors to avoid matching multiple elements
            if (element.id) {
              selectorStr = '#' + element.id;
            } else if (element.getAttribute('data-cy')) {
              // data-cy attributes are typically unique and specific for testing
              selectorStr = '[data-cy="' + element.getAttribute('data-cy') + '"]';
            } else if (element.getAttribute('data-testid')) {
              // data-testid is another common unique testing attribute
              selectorStr = '[data-testid="' + element.getAttribute('data-testid') + '"]';
            } else if (element.getAttribute('name')) {
              selectorStr = '[name="' + element.getAttribute('name') + '"]';
            } else {
              // Fall back to tag + classes (less specific, may match multiple elements)
              const tag = element.tagName.toLowerCase();
              const classes = element.className
                ? '.' + String(element.className)
                    .split(' ')
                    .filter(function(c) { return c && !c.includes('=') && !c.includes(':'); })
                    .map(function(c) { return c.replace(/[^a-zA-Z0-9_-]/g, ''); })
                    .filter(function(c) { return c.length > 0; })
                    .join('.')
                : '';
              selectorStr = tag + classes;
            }
            
            const inModal = isInModal(element);
            
            // Check if field is required (marked with * or has required attribute)
            let isRequired = false;
            if (element.hasAttribute('required')) {
              isRequired = true;
            } else {
              // Check if label or nearby text contains asterisk
              let label = element.getAttribute('aria-label') || '';
              let labelElement = element;
              // Try to find associated label
              if (element.id) {
                const associatedLabel = document.querySelector('label[for="' + element.id + '"]');
                if (associatedLabel) {
                  label = associatedLabel.textContent || '';
                  labelElement = associatedLabel;
                }
              }
              // Check parent for label
              let parent = element.parentElement;
              while (parent && parent !== document.body && !label.includes('*')) {
                if (parent.tagName === 'LABEL') {
                  label = parent.textContent || '';
                  labelElement = parent;
                  break;
                }
                parent = parent.parentElement;
              }
              // Check if label text contains asterisk
              if (label.includes('*') || label.includes('✱')) {
                isRequired = true;
              }
              // Also check previous sibling for asterisk (common pattern: <span>*</span><input>)
              let prevSibling = labelElement.previousElementSibling;
              if (prevSibling && (prevSibling.textContent === '*' || prevSibling.textContent === '✱')) {
                isRequired = true;
              }
            }
            
            // Check if element is disabled
            let isDisabled = false;
            // Check disabled property (for form elements like button, input, etc.)
            if (element.disabled === true) {
              isDisabled = true;
            }
            // Check aria-disabled attribute
            if (element.getAttribute('aria-disabled') === 'true') {
              isDisabled = true;
            }
            // Check if element has class containing "disabled"
            const className = element.className || '';
            const classStr = String(className).toLowerCase();
            if (classStr.includes('disabled')) {
              isDisabled = true;
            }
            
            const simplified = {
              tag: element.tagName,
              text: text || '(no text)',
              selector: selectorStr,
              type: element.getAttribute('type') || undefined,
              role: element.getAttribute('role') || undefined,
              isInModal: inModal,
              isRequired: isRequired,
              isDisabled: isDisabled
            };
            
            elements.push(simplified);
          });
        });
        
        return elements;
      })();
    `;
    
    const simplifiedElements = await this.page.evaluate(evaluateCode) as SimplifiedElement[];

    // Convert to structured string format for LLM consumption
    const domState = this.formatDOMState(simplifiedElements);

    // Generate fingerprint (hash of domState for uniqueness)
    const fingerprint = createHash('sha256').update(domState).digest('hex').substring(0, 16);

    return {
      domState,
      currentUrl: finalUrl,
      fingerprint,
    };
  }

  /**
   * Format simplified elements into a concise string for LLM
   */
  private formatDOMState(elements: SimplifiedElement[]): string {
    if (elements.length === 0) {
      return 'No actionable elements found on this page.';
    }

    // Separate modal and non-modal elements
    const modalElements: SimplifiedElement[] = [];
    const regularElements: SimplifiedElement[] = [];
    
    elements.forEach(el => {
      if (el.isInModal) {
        modalElements.push(el);
      } else {
        regularElements.push(el);
      }
    });

    const lines: string[] = [];
    
    // Add modal section first if modals are present
    if (modalElements.length > 0) {
      lines.push(`=== MODAL SECTION (${modalElements.length} elements) - PRIORITIZE THESE ===`);
      modalElements.forEach((el, idx) => {
        const parts = [`[${idx}] ${el.tag} [MODAL]`];
        if (el.text) parts.push(`Text: "${el.text}"`);
        if (el.type) parts.push(`Type: ${el.type}`);
        if (el.role) parts.push(`Role: ${el.role}`);
        if (el.isRequired) parts.push(`⚠️ REQUIRED`);
        if (el.isDisabled) parts.push(`⚠️ DISABLED`);
        // Highlight "Next" and "Done" buttons
        const textLower = (el.text || '').toLowerCase();
        if (textLower.includes('next') || textLower.includes('done') || textLower.includes('continue') || textLower.includes('submit')) {
          parts.push(`🎯 PRIORITY BUTTON`);
        }
        parts.push(`Selector: ${el.selector}`);
        lines.push(parts.join(' | '));
      });
      lines.push(''); // Empty line separator
    }

    // Add regular elements section
    if (regularElements.length > 0) {
      lines.push(`Actionable Elements (${regularElements.length}):`);
      regularElements.forEach((el, idx) => {
        const parts = [`[${idx}] ${el.tag}`];
        if (el.text) parts.push(`Text: "${el.text}"`);
        if (el.type) parts.push(`Type: ${el.type}`);
        if (el.role) parts.push(`Role: ${el.role}`);
        if (el.isRequired) parts.push(`⚠️ REQUIRED`);
        if (el.isDisabled) parts.push(`⚠️ DISABLED`);
        parts.push(`Selector: ${el.selector}`);
        lines.push(parts.join(' | '));
      });
    }

    return lines.join('\n');
  }

  /**
   * Sanitize a CSS selector to remove invalid characters
   */
  private sanitizeSelector(selector: string): string {
    if (!selector) return selector;
    
    // Remove any parts with = (attribute-like syntax that's not valid CSS)
    // Split by space and filter out invalid parts
    const parts = selector.split(/\s+/).filter(part => {
      // Remove parts that contain = (not valid in CSS class selectors)
      if (part.includes('=') && !part.startsWith('[') && !part.endsWith(']')) {
        return false;
      }
      return true;
    });
    
    return parts.join(' ').trim();
  }

  /**
   * Click an element by selector
   */
  async clickElement(selector: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized.');
    }
    // Sanitize selector to remove invalid characters
    const sanitized = this.sanitizeSelector(selector);
    await this.page.click(sanitized);
    // Wait for navigation or state change
    await this.page.waitForTimeout(500);
  }

  /**
   * Type text into an input element
   */
  async typeText(selector: string, text: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized.');
    }
    // Sanitize selector to remove invalid characters
    const sanitized = this.sanitizeSelector(selector);
    await this.page.fill(sanitized, text);
  }

  /**
   * Select an option in a dropdown
   */
  async selectOption(selector: string, value: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized.');
    }
    // Sanitize selector to remove invalid characters
    const sanitized = this.sanitizeSelector(selector);
    await this.page.selectOption(sanitized, value);
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized.');
    }
    try {
      await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (error: any) {
      // Handle connection errors more gracefully
      if (error.message?.includes('ERR_CONNECTION_REFUSED') || error.message?.includes('net::ERR_CONNECTION_REFUSED')) {
        throw new Error(
          `Connection refused: Unable to connect to ${url}. ` +
          `Please ensure the development server is running. ` +
          `For test-app, run: yarn dev:test-app`
        );
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get current page URL
   */
  getCurrentUrl(): string {
    if (!this.page) {
      throw new Error('Browser not initialized.');
    }
    return this.page.url();
  }

  /**
   * Wait for network to be idle by actively monitoring network requests
   * Waits until there are no active network requests for at least 500ms
   */
  async waitForNetworkIdle(timeout: number = 30000): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized.');
    }

    const startTime = Date.now();
    let lastRequestFinishTime = 0; // Track when the last request finished
    let activeRequests = 0;
    const idleDuration = 500; // Wait for 500ms of no requests

    // Track request start
    const requestHandler = () => {
      activeRequests++;
    };

    // Track request finish
    const responseHandler = () => {
      activeRequests = Math.max(0, activeRequests - 1);
      if (activeRequests === 0) {
        // Update the time when all requests finished
        lastRequestFinishTime = Date.now();
      }
    };

    // Listen to network events
    this.page.on('request', requestHandler);
    this.page.on('response', responseHandler);
    this.page.on('requestfailed', responseHandler);

    try {
      // Initial wait to see if there are any requests in flight
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // If no requests were detected, start the idle timer from now
      if (activeRequests === 0 && lastRequestFinishTime === 0) {
        lastRequestFinishTime = Date.now();
      }

      // Wait for network to be idle
      while (Date.now() - startTime < timeout) {
        const timeSinceLastRequest = lastRequestFinishTime > 0 
          ? Date.now() - lastRequestFinishTime 
          : 0;
        const hasBeenIdle = activeRequests === 0 && timeSinceLastRequest >= idleDuration;

        if (hasBeenIdle) {
          return; // Successfully waited for network idle
        }

        // Check every 100ms
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // If we timed out, log a warning
      console.warn(`Network idle timeout after ${timeout}ms (${activeRequests} active requests, ${Date.now() - lastRequestFinishTime}ms since last request finished)`);
    } finally {
      // Clean up listeners
      this.page.off('request', requestHandler);
      this.page.off('response', responseHandler);
      this.page.off('requestfailed', responseHandler);
    }
  }
}

