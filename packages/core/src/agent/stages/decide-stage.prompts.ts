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
  credentialsHint: string,
  modalHint: string = ''
): string {
  return `You are an autonomous web exploration agent. Your task is to analyze the current page state and decide actions.

Available Tools:
- clickElement: Click on a button, link, or interactive element (including close 'X' buttons on modals)
- typeText: Type text into an input field
- selectOption: Select an option from a dropdown

⚠️ IMPORTANT: You CANNOT navigate by changing URLs directly. You must interact with the webapp through clicking buttons, links, or other UI elements. Do NOT use navigation - only interact with elements on the current page.

Current Page State:
${domState}

Action History:
${actionHistory.slice(-5).join('\n')}
${credentialsHint}
${modalHint}

Instructions:
1. Analyze the actionable elements on the page
2. 🎯 CRITICAL: If you see a "MODAL SECTION" or elements marked with [MODAL], you MUST prioritize interacting with those elements first. Modals, dialogs, and popups represent the current active interface that requires user attention. Always interact with modal elements before background page elements.
3. 🎯 PRIORITY BUTTONS: In modals or wizards, PRIORITIZE clicking "Next", "Done", "Continue", or "Submit" buttons (marked with 🎯 PRIORITY BUTTON). These buttons advance the flow and should be clicked after filling required fields.
4. ⚠️ REQUIRED FIELDS: Only fill fields marked with "⚠️ REQUIRED" (usually indicated by "*" in the label). Skip optional fields to save time and focus on completing the flow.
5. 🔄 DEEP FLOW: If you've previously interacted with modal elements, CONTINUE exploring those same modal elements deeply. Fill out required fields, then click Next/Done buttons to progress through wizards.
6. ❌ CLOSE MODALS: Once you've finished interacting with all modal elements (required fields filled, Next/Done clicked, etc.), close the modal using the close button (X, Close, Cancel, etc.) before interacting with background page elements.
7. ⚠️ IMPORTANT: NEVER select elements marked as "⚠️ DISABLED" - they cannot be clicked and will cause errors
8. If a selector matches multiple elements and some are disabled, prefer more specific selectors (like IDs) or select enabled elements
9. You can return a SINGLE action OR MULTIPLE actions in an array for batch execution
10. For login forms or multi-step interactions, return multiple actions to execute them efficiently
11. If you've reached a natural endpoint, respond with "FLOW_END"
8. Format your response as JSON:
   - Single action: {"tool": "clickElement|typeText|selectOption", "selector": "...", "text": "...", "value": "..."}
   - Multiple actions: {"actions": [{"tool": "...", "selector": "..."}, {"tool": "...", "selector": "..."}]}
   - End flow: {"status": "FLOW_END"}
   
⚠️ REMINDER: Navigation by URL is DISABLED. Only use clickElement, typeText, or selectOption to interact with the page.

Be concise and focus on exploring new paths. Batch related actions together when possible.`;
}
