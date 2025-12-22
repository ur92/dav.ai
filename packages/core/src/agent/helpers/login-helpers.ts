/**
 * Login Helpers - Utilities for detecting and interacting with login forms
 */

/**
 * Detect if the current page is a login screen
 * More specific detection to avoid false positives on user creation forms
 */
export function detectLoginScreen(domState: string): boolean {
  const lowerDom = domState.toLowerCase();
  
  // Negative indicators - if present, this is NOT a login screen
  const notLoginIndicators = [
    'create user',
    'new user',
    'register',
    'sign up',
    'signup',
    'create account',
    'edit user',
    'update user',
    'add user',
  ];
  
  // If we find negative indicators, it's not a login screen
  if (notLoginIndicators.some(indicator => lowerDom.includes(indicator))) {
    return false;
  }
  
  // Positive indicators - strong signals that this is a login screen
  const strongLoginIndicators = [
    'log in',
    'login',
    'sign in',
    'signin',
  ];
  
  // Check for strong login indicators in button/heading text
  const hasLoginButton = strongLoginIndicators.some(indicator => {
    // Look for login button text or login heading
    return lowerDom.includes(`text: "${indicator}"`) || 
           lowerDom.includes(`"${indicator}"`) ||
           lowerDom.includes(`>${indicator}<`);
  });
  
  // Required fields for login
  const hasPasswordField = lowerDom.includes('type="password"') || 
                           lowerDom.includes('type: password') ||
                           lowerDom.includes('#password');
  
  const hasUsernameField = lowerDom.includes('id="username"') || 
                           lowerDom.includes('#username') ||
                           lowerDom.includes('autocomplete="username"');
  
  // A login screen should have:
  // 1. A password field AND a username field
  // 2. A login/sign-in button or indicator
  return hasPasswordField && hasUsernameField && hasLoginButton;
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
