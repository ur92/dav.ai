import { ExplorationState, BacktrackTarget } from '../../types/state.js';
import { logger } from '../../utils/logger.js';

/**
 * ActionIdentifier - Unique identifier for an action
 * Combines selector with text to distinguish elements with same selector
 */
export interface ActionIdentifier {
  selector: string;
  text: string;
  uniqueId: string;  // selector|||text combined key
}

/**
 * Extract action identifiers from DOM state string
 * Parses the formatted DOM state and extracts selector + text for uniqueness
 */
export function extractActionIdentifiers(domState: string): ActionIdentifier[] {
  const actions: ActionIdentifier[] = [];
  const lines = domState.split('\n');
  
  for (const line of lines) {
    // Skip headers and empty lines
    if (line.includes('===') || line.includes('Actionable Elements') || line.trim() === '') {
      continue;
    }
    
    // Skip disabled elements - they can't be interacted with
    if (line.includes('DISABLED')) {
      continue;
    }
    
    // Extract selector
    const selectorMatch = line.match(/Selector:\s*(.+?)$/);
    if (!selectorMatch || !selectorMatch[1]) {
      continue;
    }
    const selector = selectorMatch[1].trim();
    
    // Extract text content
    const textMatch = line.match(/Text:\s*"([^"]+)"/);
    const text = textMatch ? textMatch[1].trim() : '';
    
    // Create unique identifier
    const uniqueId = `${selector}|||${text}`;
    
    actions.push({ selector, text, uniqueId });
  }
  
  return actions;
}

/**
 * Extract just the selectors from DOM state (legacy support)
 */
export function extractActionSelectors(domState: string): string[] {
  return extractActionIdentifiers(domState).map(a => a.selector);
}

/**
 * Compute unexplored actions by subtracting explored from available
 * Now works with unique identifiers to handle duplicate selectors
 */
export function computeUnexploredActions(
  availableActions: string[],
  exploredActions: string[]
): string[] {
  const exploredSet = new Set(exploredActions);
  return availableActions.filter(action => !exploredSet.has(action));
}

/**
 * Get or create exploration state for a URL
 * KEY CHANGE: Uses URL as primary key instead of fingerprint
 * This ensures exploration state persists across page content changes
 */
export function getOrCreateExplorationState(
  frontier: Map<string, ExplorationState>,
  fingerprint: string,
  url: string,
  availableActions: string[],
  parentFingerprint?: string
): ExplorationState {
  // Use URL as the key for exploration state (more stable than fingerprint)
  const urlKey = normalizeUrl(url);
  let state = frontier.get(urlKey);
  
  if (!state) {
    // Check if any other fingerprint had this URL and inherit explored actions
    const existingExploredActions: string[] = [];
    Array.from(frontier.entries()).forEach(([, existingState]) => {
      if (normalizeUrl(existingState.url) === urlKey) {
        existingExploredActions.push(...existingState.exploredActions);
      }
    });
    
    state = {
      fingerprint: urlKey,  // Use URL as fingerprint for stability
      url,
      availableActions,
      exploredActions: Array.from(new Set(existingExploredActions)),  // Inherit and dedupe
      parentFingerprint,
    };
    frontier.set(urlKey, state);
    
    if (existingExploredActions.length > 0) {
      logger.info('BACKTRACK', `Created exploration state for ${urlKey} inheriting ${existingExploredActions.length} explored actions`);
    } else {
      logger.info('BACKTRACK', `Created new exploration state for ${urlKey} with ${availableActions.length} actions`);
    }
  } else {
    // Update fingerprint to latest and merge available actions
    state.fingerprint = fingerprint;
    const newActions = availableActions.filter(a => !state!.availableActions.includes(a));
    if (newActions.length > 0) {
      state.availableActions = [...state.availableActions, ...newActions];
      logger.info('BACKTRACK', `Updated exploration state ${urlKey} with ${newActions.length} new actions`);
    }
  }
  
  return state;
}

/**
 * Normalize URL for comparison (remove trailing slashes, etc.)
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash
    let path = parsed.pathname.replace(/\/$/, '');
    // Return normalized URL without query params for state matching
    return `${parsed.origin}${path}`;
  } catch {
    return url;
  }
}

/**
 * Mark an action as explored for a given URL
 * KEY CHANGE: Marks by unique action ID (selector|||text) instead of just selector
 */
export function markActionExplored(
  frontier: Map<string, ExplorationState>,
  fingerprint: string,
  selector: string,
  actionText?: string
): void {
  // Find state by URL (fingerprint is now URL-based)
  const state = frontier.get(fingerprint);
  if (!state) {
    // Try to find by looking up the URL from fingerprint
    const entries = Array.from(frontier.entries());
    for (let i = 0; i < entries.length; i++) {
      const [key, s] = entries[i];
      if (s.fingerprint === fingerprint || normalizeUrl(s.url) === fingerprint) {
        const uniqueId = actionText ? `${selector}|||${actionText}` : selector;
        if (!s.exploredActions.includes(uniqueId)) {
          s.exploredActions.push(uniqueId);
          logger.info('BACKTRACK', `Marked action explored: ${uniqueId.substring(0, 50)}... in ${key}`);
        }
        return;
      }
    }
    return;
  }
  
  const uniqueId = actionText ? `${selector}|||${actionText}` : selector;
  if (!state.exploredActions.includes(uniqueId)) {
    state.exploredActions.push(uniqueId);
    logger.info('BACKTRACK', `Marked action explored: ${uniqueId.substring(0, 50)}... in ${normalizeUrl(state.url)}`);
  }
}

/**
 * Mark action explored by URL directly
 */
export function markActionExploredByUrl(
  frontier: Map<string, ExplorationState>,
  url: string,
  selector: string,
  actionText?: string
): void {
  const urlKey = normalizeUrl(url);
  const state = frontier.get(urlKey);
  if (!state) return;
  
  const uniqueId = actionText ? `${selector}|||${actionText}` : selector;
  if (!state.exploredActions.includes(uniqueId)) {
    state.exploredActions.push(uniqueId);
    logger.info('BACKTRACK', `Marked action explored by URL: ${uniqueId.substring(0, 50)}... in ${urlKey}`);
  }
}

/**
 * Update backtrack stack with current state if it has unexplored actions
 * KEY CHANGE: Uses URL as key for deduplication
 */
export function updateBacktrackStack(
  stack: BacktrackTarget[],
  frontier: Map<string, ExplorationState>,
  fingerprint: string
): void {
  const state = frontier.get(fingerprint);
  if (!state) return;
  
  const urlKey = normalizeUrl(state.url);
  const unexploredCount = computeUnexploredActions(
    state.availableActions,
    state.exploredActions
  ).length;
  
  // Remove existing entry for this URL (not fingerprint)
  const existingIndex = stack.findIndex(t => normalizeUrl(t.url) === urlKey);
  if (existingIndex !== -1) {
    stack.splice(existingIndex, 1);
  }
  
  // Only add if there are unexplored actions
  if (unexploredCount > 0) {
    stack.push({
      fingerprint: urlKey,  // Use URL as fingerprint for stability
      url: state.url,
      unexploredCount,
    });
    logger.info('BACKTRACK', `Added to backtrack stack: ${urlKey} with ${unexploredCount} unexplored actions`);
  }
}

/**
 * Extract URL path pattern from a URL
 * Converts specific URLs to patterns (e.g., /users/123 -> /users/*)
 */
function extractUrlPattern(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    
    // Root path
    if (path === '/' || path === '') {
      return '/';
    }
    
    // Extract first path segment as pattern (e.g., /users/123/edit -> /users/*)
    const segments = path.split('/').filter(s => s.length > 0);
    if (segments.length === 0) {
      return '/';
    }
    
    // Return pattern: /first-segment/*
    return `/${segments[0]}/*`;
  } catch {
    // If URL parsing fails, try to extract pattern from pathname directly
    const path = url.split('?')[0]; // Remove query params
    if (path === '/' || path === '') {
      return '/';
    }
    const segments = path.split('/').filter(s => s.length > 0);
    if (segments.length === 0) {
      return '/';
    }
    return `/${segments[0]}/*`;
  }
}

/**
 * Find the best state to backtrack to (one with unexplored actions)
 * Prioritizes URLs from unexplored sections for breadth-first exploration
 * Returns null if no backtracking is possible
 */
export function findBacktrackTarget(
  stack: BacktrackTarget[],
  frontier: Map<string, ExplorationState>
): BacktrackTarget | null {
  // First, analyze section coverage to identify unexplored patterns
  const coverage = analyzeSectionCoverage(frontier);
  const exploredPatterns = new Set(Array.from(coverage.keys()));
  
  // Create a copy of stack to avoid mutating the original during analysis
  const stackCopy = [...stack];
  
  // Separate targets by section pattern
  const targetsByPattern = new Map<string, BacktrackTarget[]>();
  const targetsWithoutPattern: BacktrackTarget[] = [];
  
  for (const target of stackCopy) {
    const urlKey = normalizeUrl(target.url);
    const state = frontier.get(urlKey);
    if (!state) continue;
    
    const pattern = extractUrlPattern(state.url);
    const isUnexploredSection = !exploredPatterns.has(pattern);
    
    if (isUnexploredSection) {
      // Prioritize targets from unexplored sections
      if (!targetsByPattern.has(pattern)) {
        targetsByPattern.set(pattern, []);
      }
      targetsByPattern.get(pattern)!.push(target);
    } else {
      targetsWithoutPattern.push(target);
    }
  }
  
  // Priority 1: Targets from unexplored sections (breadth-first)
  for (const [pattern, targets] of targetsByPattern.entries()) {
    // Process targets in reverse order (most recent first within each pattern)
    for (let i = targets.length - 1; i >= 0; i--) {
      const target = targets[i];
      const urlKey = normalizeUrl(target.url);
      const state = frontier.get(urlKey);
      
      if (!state) continue;
      
      const unexplored = computeUnexploredActions(
        state.availableActions,
        state.exploredActions
      );
      
      if (unexplored.length > 0) {
        logger.info('BACKTRACK', `Found backtrack target from unexplored section ${pattern}: ${urlKey} with ${unexplored.length} unexplored actions`);
        return {
          fingerprint: urlKey,
          url: state.url,
          unexploredCount: unexplored.length,
        };
      }
    }
  }
  
  // Priority 2: Targets with modals (check if page has modal elements)
  // This is detected generically - we'll check for modal indicators in available actions
  for (let i = targetsWithoutPattern.length - 1; i >= 0; i--) {
    const target = targetsWithoutPattern[i];
    const urlKey = normalizeUrl(target.url);
    const state = frontier.get(urlKey);
    
    if (!state) continue;
    
    const unexplored = computeUnexploredActions(
      state.availableActions,
      state.exploredActions
    );
    
    // Check if any unexplored actions might be modal-related (generic check)
    const hasModalActions = unexplored.some(action => 
      action.toLowerCase().includes('[modal]') || 
      action.toLowerCase().includes('modal')
    );
    
    if (unexplored.length > 0) {
      if (hasModalActions) {
        logger.info('BACKTRACK', `Found backtrack target with modal actions: ${urlKey} with ${unexplored.length} unexplored actions`);
      } else {
        logger.info('BACKTRACK', `Found backtrack target: ${urlKey} with ${unexplored.length} unexplored actions`);
      }
      return {
        fingerprint: urlKey,
        url: state.url,
        unexploredCount: unexplored.length,
      };
    }
  }
  
  // Priority 3: Process remaining stack (most recent first)
  while (stack.length > 0) {
    const target = stack.pop()!;
    const urlKey = normalizeUrl(target.url);
    const state = frontier.get(urlKey);
    
    if (!state) continue;
    
    const unexplored = computeUnexploredActions(
      state.availableActions,
      state.exploredActions
    );
    
    if (unexplored.length > 0) {
      logger.info('BACKTRACK', `Found backtrack target: ${urlKey} with ${unexplored.length} unexplored actions`);
      return {
        fingerprint: urlKey,
        url: state.url,
        unexploredCount: unexplored.length,
      };
    }
    
    logger.info('BACKTRACK', `Skipping exhausted state: ${urlKey}`);
  }
  
  logger.info('BACKTRACK', 'No valid backtrack targets found - exploration complete');
  return null;
}

/**
 * Filter DOM state to show only unexplored actions
 * This helps the LLM focus on actions that haven't been tried
 * KEY CHANGE: Works with unique IDs (selector|||text) for filtering
 */
export function filterDomStateToUnexplored(
  domState: string,
  unexploredSelectors: string[]
): string {
  // Build a set of unexplored unique IDs
  const unexploredSet = new Set(unexploredSelectors);
  const lines = domState.split('\n');
  const filteredLines: string[] = [];
  
  let modalElementCount = 0;
  let regularElementCount = 0;
  
  for (const line of lines) {
    // Skip headers
    if (line.includes('=== MODAL SECTION') || line.includes('Actionable Elements') || line.includes('Unexplored')) {
      continue;
    }
    
    // Keep empty lines for formatting
    if (line.trim() === '') {
      continue;
    }
    
    // Extract selector and text from line
    const selectorMatch = line.match(/Selector:\s*(.+?)$/);
    if (!selectorMatch) continue;
    
    const selector = selectorMatch[1].trim();
    const textMatch = line.match(/Text:\s*"([^"]+)"/);
    const text = textMatch ? textMatch[1].trim() : '';
    
    // Check both unique ID and plain selector for compatibility
    const uniqueId = `${selector}|||${text}`;
    if (unexploredSet.has(uniqueId) || unexploredSet.has(selector)) {
      if (line.includes('[MODAL]')) {
        modalElementCount++;
      } else {
        regularElementCount++;
      }
      filteredLines.push(line);
    }
  }
  
  // Rebuild with proper headers
  const result: string[] = [];
  
  if (modalElementCount > 0) {
    result.push(`=== MODAL SECTION (${modalElementCount} unexplored elements) - PRIORITIZE THESE ===`);
  }
  
  const modalLines = filteredLines.filter(l => l.includes('[MODAL]'));
  const regularLines = filteredLines.filter(l => !l.includes('[MODAL]'));
  
  result.push(...modalLines);
  
  if (modalLines.length > 0 && regularLines.length > 0) {
    result.push('');
  }
  
  if (regularElementCount > 0) {
    result.push(`Unexplored Actionable Elements (${regularElementCount}):`);
  }
  result.push(...regularLines);
  
  if (result.length === 0) {
    return 'No unexplored actions available on this page.';
  }
  
  return result.join('\n');
}

/**
 * Check if exploration is complete (no unexplored actions anywhere)
 */
export function isExplorationComplete(
  frontier: Map<string, ExplorationState>,
  stack: BacktrackTarget[]
): boolean {
  // Quick check: if stack has items, not complete
  if (stack.length > 0) {
    // Verify at least one has unexplored actions
    for (const target of stack) {
      const urlKey = normalizeUrl(target.url);
      const state = frontier.get(urlKey);
      if (state) {
        const unexplored = computeUnexploredActions(
          state.availableActions,
          state.exploredActions
        );
        if (unexplored.length > 0) {
          return false;
        }
      }
    }
  }
  
  // Check all states in frontier
  const states = Array.from(frontier.values());
  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    const unexplored = computeUnexploredActions(
      state.availableActions,
      state.exploredActions
    );
    if (unexplored.length > 0) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get text content from a DOM line
 */
export function getTextFromDomLine(domState: string, selector: string): string {
  const lines = domState.split('\n');
  for (const line of lines) {
    if (line.includes(`Selector: ${selector}`)) {
      const textMatch = line.match(/Text:\s*"([^"]+)"/);
      return textMatch ? textMatch[1].trim() : '';
    }
  }
  return '';
}

/**
 * Section Coverage Analysis - Derive section coverage from frontier URLs
 * Generic approach: analyzes URL path patterns to identify major sections
 */

/**
 * Analyze section coverage from exploration frontier
 * Returns a map of URL path patterns to whether they've been visited
 */
export function analyzeSectionCoverage(
  frontier: Map<string, ExplorationState> | Record<string, ExplorationState>
): Map<string, boolean> {
  const coverage = new Map<string, boolean>();
  const frontierMap = frontier instanceof Map ? frontier : new Map(Object.entries(frontier));
  
  // Analyze all URLs in frontier
  for (const state of frontierMap.values()) {
    const pattern = extractUrlPattern(state.url);
    coverage.set(pattern, true);
  }
  
  return coverage;
}

/**
 * Get unexplored URL path patterns
 * Compares visited patterns with all available patterns from frontier
 * Returns patterns that haven't been visited
 */
export function getUnexploredSections(
  frontier: Map<string, ExplorationState> | Record<string, ExplorationState>,
  allAvailablePatterns?: string[]
): string[] {
  const coverage = analyzeSectionCoverage(frontier);
  const exploredPatterns = Array.from(coverage.keys());
  
  // If all available patterns are provided, return those not in explored
  if (allAvailablePatterns) {
    return allAvailablePatterns.filter(pattern => !coverage.has(pattern));
  }
  
  // Otherwise, we can't determine what's unexplored without knowing what exists
  // This is a limitation - we only know what we've visited, not what exists
  // For now, return empty array - the caller should provide available patterns
  // or we rely on the LLM to discover new sections via navigation
  return [];
}

/**
 * Get section coverage summary for LLM hints
 * Returns a human-readable summary of which URL patterns have been explored
 */
export function getSectionCoverageSummary(
  frontier: Map<string, ExplorationState> | Record<string, ExplorationState>
): string {
  const coverage = analyzeSectionCoverage(frontier);
  const explored = Array.from(coverage.keys()).sort();
  
  if (explored.length === 0) {
    return 'No sections explored yet.';
  }
  
  const sections = explored.map(pattern => {
    const count = frontier instanceof Map 
      ? Array.from(frontier.values()).filter(s => extractUrlPattern(s.url) === pattern).length
      : Object.values(frontier).filter(s => extractUrlPattern(s.url) === pattern).length;
    return `${pattern} (${count} page${count !== 1 ? 's' : ''})`;
  }).join(', ');
  
  return `Explored sections: ${sections}`;
}
