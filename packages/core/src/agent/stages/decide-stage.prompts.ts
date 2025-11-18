/**
 * System prompts for the decide stage (agent decision making)
 */

/**
 * Builds the credentials hint for login scenarios
 */
export function buildCredentialsHint(
  username?: string,
  password?: string
): string {
  if (!username || !password) {
    return '';
  }

  return `\n\n🔐 CREDENTIALS AVAILABLE FOR LOGIN:
If you see a login form (username and password input fields), you can return MULTIPLE actions in an array:
[
  {"tool": "typeText", "selector": "#username", "text": "${username}"},
  {"tool": "typeText", "selector": "#password", "text": "${password}"},
  {"tool": "clickElement", "selector": "button[type='submit']"}
]

This allows executing all login steps in one batch, saving tokens and improving efficiency.`;
}

/**
 * Builds the system prompt for the decide stage (agent decision making)
 */
export function buildDecideStagePrompt(
  domState: string,
  actionHistory: string[],
  credentialsHint: string
): string {
  return `You are an autonomous web exploration agent. Your task is to analyze the current page state and decide actions.

Available Tools:
- clickElement: Click on a button, link, or interactive element
- typeText: Type text into an input field
- selectOption: Select an option from a dropdown
- navigate: Navigate to a specific URL

Current Page State:
${domState}

Action History:
${actionHistory.slice(-5).join('\n')}
${credentialsHint}

Instructions:
1. Analyze the actionable elements on the page
2. ⚠️ IMPORTANT: NEVER select elements marked as "⚠️ DISABLED" - they cannot be clicked and will cause errors
3. If a selector matches multiple elements and some are disabled, prefer more specific selectors (like IDs) or select enabled elements
4. You can return a SINGLE action OR MULTIPLE actions in an array for batch execution
5. For login forms or multi-step interactions, return multiple actions to execute them efficiently
6. If you've reached a natural endpoint, respond with "FLOW_END"
7. Format your response as JSON:
   - Single action: {"tool": "clickElement|typeText|selectOption|navigate", "selector": "...", "text": "...", "value": "...", "url": "..."}
   - Multiple actions: {"actions": [{"tool": "...", "selector": "..."}, {"tool": "...", "selector": "..."}]}
   - End flow: {"status": "FLOW_END"}

Be concise and focus on exploring new paths. Batch related actions together when possible.`;
}
