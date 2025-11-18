/**
 * Login Helpers - Utilities for detecting and interacting with login forms
 */

/**
 * Detect if the current page is a login screen
 */
export function detectLoginScreen(domState: string): boolean {
  const lowerDom = domState.toLowerCase();
  // Look for common login indicators
  const loginIndicators = [
    'type="password"',
    'password',
    'username',
    'login',
    'sign in',
    'autocomplete="username"',
    'autocomplete="current-password"',
    'id="username"',
    'id="password"',
    'name="username"',
    'name="password"',
  ];
  
  // Count how many indicators we find
  const foundIndicators = loginIndicators.filter(indicator => lowerDom.includes(indicator)).length;
  
  // If we find at least 2 indicators (e.g., password field + username field), it's likely a login screen
  return foundIndicators >= 2;
}

/**
 * Find the selector for a login field (username or password)
 */
export function findLoginField(domState: string, fieldType: 'username' | 'password'): string | null {
  const lines = domState.split('\n');
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    // Look for input fields with relevant attributes
    if (fieldType === 'password') {
      if (lowerLine.includes('type="password"') || lowerLine.includes('type=password')) {
        // Extract selector from the line (format: "input[type='password']#password" or similar)
        const selectorMatch = line.match(/([a-zA-Z0-9_#.\-\[\]="' ]+)/);
        if (selectorMatch) {
          // Try to find id, name, or class
          const idMatch = line.match(/id[=:](['"]?)([^'"\s]+)\1/i);
          if (idMatch) return `#${idMatch[2]}`;
          const nameMatch = line.match(/name[=:](['"]?)([^'"\s]+)\1/i);
          if (nameMatch) return `[name="${nameMatch[2]}"]`;
          const classMatch = line.match(/class[=:](['"]?)([^'"\s]+)\1/i);
          if (classMatch) return `.${classMatch[2].split(' ')[0]}`;
        }
      }
    } else {
      // Username field
      if ((lowerLine.includes('username') || lowerLine.includes('autocomplete="username"')) && 
          !lowerLine.includes('password')) {
        const idMatch = line.match(/id[=:](['"]?)([^'"\s]+)\1/i);
        if (idMatch) return `#${idMatch[2]}`;
        const nameMatch = line.match(/name[=:](['"]?)([^'"\s]+)\1/i);
        if (nameMatch) return `[name="${nameMatch[2]}"]`;
        const classMatch = line.match(/class[=:](['"]?)([^'"\s]+)\1/i);
        if (classMatch) return `.${classMatch[2].split(' ')[0]}`;
      }
    }
  }
  
  // Fallback: try common selectors
  if (fieldType === 'password') {
    return '#password, [name="password"], [type="password"]';
  } else {
    return '#username, [name="username"], input[autocomplete="username"]';
  }
}

/**
 * Find the submit/login button selector
 */
export function findSubmitButton(domState: string): string | null {
  const lines = domState.split('\n');
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    // Look for submit buttons, login buttons
    if ((lowerLine.includes('type="submit"') || 
         lowerLine.includes('button') && (lowerLine.includes('login') || lowerLine.includes('sign in'))) &&
        !lowerLine.includes('input')) {
      const idMatch = line.match(/id[=:](['"]?)([^'"\s]+)\1/i);
      if (idMatch) return `#${idMatch[2]}`;
      const classMatch = line.match(/class[=:](['"]?)([^'"\s]+)\1/i);
      if (classMatch) {
        const firstClass = classMatch[2].split(' ')[0];
        return `.${firstClass}`;
      }
      const textMatch = line.match(/>([^<]*login[^<]*)</i);
      if (textMatch) {
        // Try to find button by text content
        return 'button:has-text("Login"), button:has-text("Sign in"), [type="submit"]';
      }
    }
  }
  
  // Fallback: common selectors
  return 'button[type="submit"], .login-button, button:has-text("Login"), button:has-text("Sign in")';
}

