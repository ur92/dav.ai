/**
 * Modal Helpers - Utilities for detecting and interacting with modals, dialogs, and popups
 */

/**
 * Detect if the current page contains modal/dialog indicators
 * Generic detection using ARIA attributes, common patterns, and overlay elements
 */
export function detectModal(domState: string): boolean {
  const lowerDom = domState.toLowerCase();
  
  // Look for common modal/dialog indicators
  const modalIndicators = [
    // ARIA attributes (most reliable)
    'role="dialog"',
    'aria-modal="true"',
    'aria-labelledby',
    'aria-describedby',
    
    // Common class patterns (generic, not app-specific)
    'class="dialog',
    'class="modal',
    'class="overlay',
    'class="backdrop',
    'class="popup',
    'class="popover',
    
    // DOM state markers (from browser-tools extraction)
    '[modal]',
    '[dialog]',
    
    // Common framework patterns (generic)
    'modal-dialog',
    'modal-content',
    'modal-overlay',
    'modal-backdrop',
    'dialog-container',
    'dialog-overlay',
    
    // React/common component patterns (generic)
    'el-dialog',
    'el-p-modal-dialog',
    'ant-modal',
    'mui-dialog',
  ];
  
  // Check if any modal indicators are present
  return modalIndicators.some(indicator => lowerDom.includes(indicator));
}

/**
 * Check if an element is nested within a modal container
 * This checks the DOM state string for modal context around the element
 */
export function isElementInModal(domState: string, elementIndex: number): boolean {
  const lines = domState.split('\n');
  
  // Look backwards from the element to find if it's within a modal section
  // Modals are typically marked with [MODAL] prefix or in a MODAL section
  for (let i = elementIndex; i >= 0; i--) {
    const line = lines[i];
    if (line.includes('[MODAL]') || line.toLowerCase().includes('modal section')) {
      return true;
    }
    // If we hit a non-modal section header, stop looking
    if (i < elementIndex && line.includes('Actionable Elements') && !line.includes('MODAL')) {
      break;
    }
  }
  
  return false;
}

/**
 * Extract elements that are within modals from the DOM state
 */
export function extractModalElements(domState: string): string[] {
  const lines = domState.split('\n');
  const modalElements: string[] = [];
  let inModalSection = false;
  
  for (const line of lines) {
    if (line.includes('[MODAL]') || line.toLowerCase().includes('modal section')) {
      inModalSection = true;
      continue;
    }
    
    if (inModalSection) {
      // Check if we've left the modal section
      if (line.includes('Actionable Elements') && !line.includes('MODAL')) {
        inModalSection = false;
        continue;
      }
      
      // Collect modal elements
      if (line.trim() && !line.includes('Actionable Elements')) {
        modalElements.push(line);
      }
    } else if (line.includes('[MODAL]')) {
      // Element marked with [MODAL] prefix
      modalElements.push(line);
    }
  }
  
  return modalElements;
}

/**
 * Detect close buttons in modal elements
 * Looks for buttons with common close button patterns
 */
export function findModalCloseButtons(domState: string): string[] {
  const lines = domState.split('\n');
  const closeButtons: string[] = [];
  let inModalSection = false;
  
  for (const line of lines) {
    if (line.includes('[MODAL]') || line.toLowerCase().includes('modal section')) {
      inModalSection = true;
      continue;
    }
    
    if (inModalSection) {
      // Check if we've left the modal section
      if (line.includes('Actionable Elements') && !line.includes('MODAL')) {
        inModalSection = false;
        continue;
      }
      
      // Look for close button patterns
      const lowerLine = line.toLowerCase();
      const isCloseButton = 
        (lowerLine.includes('close') || 
         lowerLine.includes('×') ||
         lowerLine.includes('✕') ||
         lowerLine.includes('x') && (lowerLine.includes('button') || lowerLine.includes('icon'))) &&
        lowerLine.includes('[modal]');
      
      if (isCloseButton && line.includes('Selector:')) {
        // Extract selector
        const selectorMatch = line.match(/Selector:\s*([^\s|]+)/);
        if (selectorMatch) {
          closeButtons.push(selectorMatch[1]);
        }
      }
    }
  }
  
  return closeButtons;
}
