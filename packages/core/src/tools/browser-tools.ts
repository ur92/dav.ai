import { Browser, Page, chromium } from 'playwright';
import { SimplifiedElement } from '../types/state.js';
import { createHash } from 'crypto';

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
    this.browser = await chromium.launch({
      headless: this.headless,
    });
    this.page = await this.browser.newPage();
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
  async observe(url?: string): Promise<{ domState: string; currentUrl: string; fingerprint: string }> {
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
    const simplifiedElements = await this.page.evaluate(() => {
      const elements: SimplifiedElement[] = [];

      // Query for all actionable elements and content elements
      const selectors = [
        'a[href]',
        'button',
        'input',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        'select',
        '[onclick]',
        'p',
        'span',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
      ];

      selectors.forEach((selector) => {
        const nodes = document.querySelectorAll(selector);
        nodes.forEach((node: Element) => {
          const element = node as HTMLElement;
          
          // Skip hidden elements
          if (element.offsetParent === null && !element.hasAttribute('aria-hidden')) {
            return;
          }

          let text = '';
          let selectorStr = '';

          // Extract text/label
          if (element.textContent) {
            text = element.textContent.trim().substring(0, 30);
          } else if (element.getAttribute('aria-label')) {
            text = element.getAttribute('aria-label')!.substring(0, 30);
          } else if (element.getAttribute('placeholder')) {
            text = element.getAttribute('placeholder')!.substring(0, 30);
          } else if (element.getAttribute('title')) {
            text = element.getAttribute('title')!.substring(0, 30);
          }

          // Generate simplified selector (prefer #id, then [name], then simple CSS)
          if (element.id) {
            selectorStr = `#${element.id}`;
          } else if (element.getAttribute('name')) {
            selectorStr = `[name="${element.getAttribute('name')}"]`;
          } else {
            // Generate a simple CSS selector
            const tag = element.tagName.toLowerCase();
            // Sanitize class names - remove invalid CSS characters like =, :, etc.
            const classes = element.className
              ? `.${String(element.className)
                  .split(' ')
                  .filter((c: string) => c && !c.includes('=') && !c.includes(':'))
                  .map((c: string) => c.replace(/[^a-zA-Z0-9_-]/g, '')) // Remove any remaining invalid chars
                  .filter((c: string) => c.length > 0) // Remove empty strings after sanitization
                  .join('.')}`
              : '';
            selectorStr = `${tag}${classes}`;
          }

          const simplified: SimplifiedElement = {
            tag: element.tagName,
            text: text || '(no text)',
            selector: selectorStr,
            type: element.getAttribute('type') || undefined,
            role: element.getAttribute('role') || undefined,
          };

          elements.push(simplified);
        });
      });

      return elements;
    });

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

    const lines = elements.map((el, idx) => {
      const parts = [`[${idx}] ${el.tag}`];
      if (el.text) parts.push(`Text: "${el.text}"`);
      if (el.type) parts.push(`Type: ${el.type}`);
      if (el.role) parts.push(`Role: ${el.role}`);
      parts.push(`Selector: ${el.selector}`);
      return parts.join(' | ');
    });

    return `Actionable Elements (${elements.length}):\n${lines.join('\n')}`;
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
}

