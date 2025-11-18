import { BrowserTools } from '../tools/browser-tools.js';
import { ConfigService } from './config-service.js';
import { UserStory } from './user-story-service.js';
import { GraphService, GraphNode, GraphEdge } from './graph-service.js';
import { SessionService } from './session-service.js';
import { logger } from '../utils/logger.js';

export interface RetryStep {
  index: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  timestamp?: number;
}

export interface RetrySession {
  retryId: string;
  sessionId: string;
  storyIndex: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: RetryStep[];
  startTime: number;
  endTime?: number;
}

/**
 * RetryService - Manages user story retry execution
 * Executes user stories step by step with delays for human readability
 */
export class RetryService {
  private static retrySessions: Map<string, RetrySession> = new Map();
  private static onStepUpdateCallback?: (retryId: string, step: RetryStep) => void;

  /**
   * Set callback for step updates (for WebSocket broadcasting)
   */
  static setStepUpdateCallback(callback: (retryId: string, step: RetryStep) => void) {
    this.onStepUpdateCallback = callback;
  }

  /**
   * Start a retry for a user story - uses the story's flow directly
   */
  static async startRetry(
    sessionId: string,
    story: UserStory,
    storyIndex: number,
    credentials?: { username?: string; password?: string }
  ): Promise<string> {
    const retryId = `retry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Use the story's flow directly - it already contains the correct sequence
    if (!story.flow || story.flow.length === 0) {
      throw new Error('User story has no flow to execute');
    }
    
    logger.info('RetryService', `Starting retry for story: "${story.title}" with ${story.flow.length} flow items`);
    
    // Query graph data to get selectors for actions (we need this for execution)
    logger.info('RetryService', `Querying graph data for selectors: ${sessionId}`);
    const graphData = await GraphService.queryGraph(500, sessionId);
    
    // Get entry URL (starting URL for the session)
    let entryUrl = this.getEntryUrl(sessionId);
    logger.info('RetryService', `Entry URL from session/config: ${entryUrl}`);
    
    // Build complete path: from entry to first story flow node, then all story flow steps
    const completePath: Array<{ from: string; to: string; action: string; selector?: string }> = [];
    
    if (story.flow.length > 0) {
      const firstFlowFrom = story.flow[0].from;
      const normalizedEntry = this.normalizeUrl(entryUrl);
      const normalizedFirstFlowFrom = this.normalizeUrl(firstFlowFrom);
      
      // If entry URL is different from first story flow node, build path to it
      if (normalizedEntry !== normalizedFirstFlowFrom) {
        const pathToFirstFlow = this.buildPathFromEntryToTarget(entryUrl, firstFlowFrom, graphData);
        if (pathToFirstFlow.length > 0) {
          logger.info('RetryService', `Built path from entry to first story flow node: ${pathToFirstFlow.length} steps`);
          completePath.push(...pathToFirstFlow);
        } else {
          logger.warn('RetryService', `No path found from entry to first story flow node, will navigate directly`);
        }
      }
      
      // Add all story flow steps
      for (const flowItem of story.flow) {
        const graphEdge = this.findGraphEdgeForFlowItem(flowItem, graphData);
        if (graphEdge) {
          // Use the graph edge's action (has technical batch format) instead of story flow's natural language
          completePath.push({
            from: flowItem.from,
            to: flowItem.to,
            action: graphEdge.action, // Use graph edge action (e.g., "Batch: typeText on #username...")
            selector: graphEdge.selector,
          });
          logger.info('RetryService', `Found graph edge for flow item: ${flowItem.from} → ${flowItem.to}, using action: "${graphEdge.action}"`);
        } else {
          // Fallback to story flow action if no graph edge found
          logger.warn('RetryService', `No graph edge found for flow item: ${flowItem.from} → ${flowItem.to}, using story flow action: "${flowItem.action}"`);
          completePath.push({
            from: flowItem.from,
            to: flowItem.to,
            action: flowItem.action,
            selector: undefined,
          });
        }
      }
    }
    
    logger.info('RetryService', `Built complete path with ${completePath.length} steps (including ${story.flow.length} story flow steps)`);
    
    // Create retry steps
    const steps: RetryStep[] = [];
    
    // Step 0: Navigate to entry URL
    steps.push({
      index: 0,
      description: `Navigate to entry: ${entryUrl}`,
      status: 'pending',
    });
    
    // Steps 1+: Execute each action in the complete path
    completePath.forEach((pathItem, idx) => {
      steps.push({
        index: idx + 1,
        description: `${pathItem.action}: ${pathItem.from} → ${pathItem.to}`,
        status: 'pending',
      });
    });

    // Create retry session
    const retrySession: RetrySession = {
      retryId,
      sessionId,
      storyIndex,
      status: 'pending',
      steps,
      startTime: Date.now(),
    };

    this.retrySessions.set(retryId, retrySession);

    // Execute retry in background using story flow
    this.executeRetry(retryId, story, graphData).catch((error) => {
      logger.error('RetryService', 'Error executing retry', {
        retryId,
        error: error instanceof Error ? error.message : String(error),
      });
      retrySession.status = 'failed';
      retrySession.endTime = Date.now();
    });

    return retryId;
  }
  
  /**
   * Find matching graph edge for a flow item by matching URLs (not action label)
   * Returns both the action and selector from the graph edge
   */
  private static findGraphEdgeForFlowItem(
    flowItem: { from: string; to: string; action: string },
    graphData: { nodes: GraphNode[]; edges: GraphEdge[] }
  ): { action: string; selector?: string } | null {
    // Normalize URLs for comparison
    const normalizedFrom = this.normalizeUrl(flowItem.from);
    const normalizedTo = this.normalizeUrl(flowItem.to);
    
    // Try to find a matching edge in the graph by URLs only (not action label)
    // The graph edge has the technical action format, which we want to use
    const matchingEdge = graphData.edges.find(edge => {
      const normalizedEdgeSource = this.normalizeUrl(edge.source);
      const normalizedEdgeTarget = this.normalizeUrl(edge.target);
      return normalizedEdgeSource === normalizedFrom && normalizedEdgeTarget === normalizedTo;
    });
    
    if (matchingEdge) {
      return {
        action: matchingEdge.label, // Use the graph edge's action (has technical batch format)
        selector: matchingEdge.selector,
      };
    }
    
    return null;
  }

  /**
   * Find entry URL for a session (from session or config)
   */
  private static getEntryUrl(sessionId: string): string {
    const session = SessionService.getSession(sessionId);
    if (session?.url) {
      return session.url;
    }
    
    // Fallback to config starting URL
    const config = ConfigService.getConfig();
    return config.startingUrl;
  }

  /**
   * Normalize URL for comparison (remove trailing slashes, etc.)
   */
  private static normalizeUrl(url: string): string {
    // Remove trailing slash except for root URLs
    return url.replace(/\/$/, '') || url;
  }

  /**
   * Find the closest matching URL in the graph
   */
  private static findClosestUrlInGraph(
    targetUrl: string,
    graphData: { nodes: GraphNode[]; edges: GraphEdge[] }
  ): string | null {
    const normalizedTarget = this.normalizeUrl(targetUrl);
    
    // First, try exact match
    for (const node of graphData.nodes) {
      if (this.normalizeUrl(node.url) === normalizedTarget) {
        return node.url;
      }
    }
    
    // Try to find URL that starts with the target (for cases like http://localhost:5173 vs http://localhost:5173/)
    for (const node of graphData.nodes) {
      const normalizedNode = this.normalizeUrl(node.url);
      if (normalizedNode === normalizedTarget || 
          normalizedNode.startsWith(normalizedTarget + '/') ||
          normalizedTarget.startsWith(normalizedNode + '/')) {
        return node.url;
      }
    }
    
    return null;
  }

  /**
   * Build a path from entry URL to target URL using DFS
   */
  private static buildPathFromEntryToTarget(
    entryUrl: string,
    targetUrl: string,
    graphData: { nodes: GraphNode[]; edges: GraphEdge[] }
  ): Array<{ from: string; to: string; action: string; selector?: string }> {
    // Normalize URLs
    const normalizedEntry = this.normalizeUrl(entryUrl);
    const normalizedTarget = this.normalizeUrl(targetUrl);
    
    // Find actual URLs in graph (they might have different formats)
    let actualEntryUrl = this.findClosestUrlInGraph(entryUrl, graphData);
    let actualTargetUrl = this.findClosestUrlInGraph(targetUrl, graphData);
    
    if (!actualEntryUrl) {
      logger.warn('RetryService', `Entry URL ${entryUrl} not found in graph. Available nodes: ${graphData.nodes.slice(0, 5).map(n => n.url).join(', ')}...`);
      // Try to use the first node in the graph as entry
      if (graphData.nodes.length > 0) {
        actualEntryUrl = graphData.nodes[0].url;
        logger.info('RetryService', `Using first node in graph as entry: ${actualEntryUrl}`);
      } else {
        logger.error('RetryService', 'No nodes found in graph');
        return [];
      }
    }
    
    if (!actualTargetUrl) {
      logger.warn('RetryService', `Target URL ${targetUrl} not found in graph. Using exact match.`);
      actualTargetUrl = targetUrl; // Try with exact URL anyway
    }
    
    logger.info('RetryService', `Building path from ${actualEntryUrl} to ${actualTargetUrl}`);
    
    // Create adjacency list
    const adjacencyList = new Map<string, Array<{ target: string; action: string; selector?: string }>>();
    
    for (const edge of graphData.edges) {
      const source = this.normalizeUrl(edge.source);
      const target = this.normalizeUrl(edge.target);
      
      if (!adjacencyList.has(source)) {
        adjacencyList.set(source, []);
      }
      adjacencyList.get(source)!.push({
        target: edge.target, // Keep original URL for path
        action: edge.label,
        selector: edge.selector,
      });
    }

    // DFS to find path from entry to target
    const visited = new Set<string>();
    const path: Array<{ from: string; to: string; action: string; selector?: string }> = [];
    
    const normalizedEntryForDfs = this.normalizeUrl(actualEntryUrl);
    const normalizedTargetForDfs = this.normalizeUrl(actualTargetUrl);
    
    const dfs = (currentUrl: string): boolean => {
      const normalizedCurrent = this.normalizeUrl(currentUrl);
      
      if (normalizedCurrent === normalizedTargetForDfs) {
        return true; // Found target
      }
      
      if (visited.has(normalizedCurrent)) {
        return false; // Already visited
      }
      
      visited.add(normalizedCurrent);
      
      const neighbors = adjacencyList.get(normalizedCurrent) || [];
      for (const neighbor of neighbors) {
        path.push({
          from: currentUrl, // Use original URL
          to: neighbor.target,
          action: neighbor.action,
          selector: neighbor.selector,
        });
        
        if (dfs(neighbor.target)) {
          return true; // Found path
        }
        
        // Backtrack
        path.pop();
      }
      
      return false;
    };

    if (dfs(actualEntryUrl)) {
      logger.info('RetryService', `Found path with ${path.length} steps`);
      return path;
    }

    // If no path found, return empty array
    logger.warn('RetryService', `No path found from ${actualEntryUrl} to ${actualTargetUrl}`);
    logger.warn('RetryService', `Graph has ${graphData.nodes.length} nodes and ${graphData.edges.length} edges`);
    if (graphData.nodes.length > 0) {
      logger.warn('RetryService', `Sample nodes: ${graphData.nodes.slice(0, 3).map(n => n.url).join(', ')}`);
    }
    return [];
  }

  /**
   * Execute a retry session - executes actions from story flow
   */
  private static async executeRetry(
    retryId: string,
    story: UserStory,
    graphData: { nodes: GraphNode[]; edges: GraphEdge[] }
  ): Promise<void> {
    const retrySession = this.retrySessions.get(retryId);
    if (!retrySession) {
      throw new Error('Retry session not found');
    }

    retrySession.status = 'running';
    logger.info('RetryService', `Starting retry execution: ${retryId} for story: "${story.title}"`);

    // Initialize browser tools
    const config = ConfigService.getConfig();
    const browserTools = new BrowserTools(config.headless);
    
    try {
      await browserTools.initialize();
      logger.info('RetryService', 'Browser initialized for retry');

      // Get entry URL and build complete path
      const entryUrl = this.getEntryUrl(retrySession.sessionId);
      
      // Build complete path: from entry to first story flow node, then all story flow steps
      const completePath: Array<{ from: string; to: string; action: string; selector?: string }> = [];
      
      if (story.flow.length > 0) {
        const firstFlowFrom = story.flow[0].from;
        const normalizedEntry = this.normalizeUrl(entryUrl);
        const normalizedFirstFlowFrom = this.normalizeUrl(firstFlowFrom);
        
        // If entry URL is different from first story flow node, build path to it
        if (normalizedEntry !== normalizedFirstFlowFrom) {
          const pathToFirstFlow = this.buildPathFromEntryToTarget(entryUrl, firstFlowFrom, graphData);
          if (pathToFirstFlow.length > 0) {
            logger.info('RetryService', `Built path from entry to first story flow node: ${pathToFirstFlow.length} steps`);
            completePath.push(...pathToFirstFlow);
          } else {
            logger.warn('RetryService', `No path found from entry to first story flow node, will navigate directly`);
          }
        }
        
        // Add all story flow steps
        for (const flowItem of story.flow) {
          const graphEdge = this.findGraphEdgeForFlowItem(flowItem, graphData);
          if (graphEdge) {
            // Use the graph edge's action (has technical batch format) instead of story flow's natural language
            completePath.push({
              from: flowItem.from,
              to: flowItem.to,
              action: graphEdge.action, // Use graph edge action (e.g., "Batch: typeText on #username...")
              selector: graphEdge.selector,
            });
            logger.info('RetryService', `Found graph edge for flow item: ${flowItem.from} → ${flowItem.to}, using action: "${graphEdge.action}"`);
          } else {
            // Fallback to story flow action if no graph edge found
            logger.warn('RetryService', `No graph edge found for flow item: ${flowItem.from} → ${flowItem.to}, using story flow action: "${flowItem.action}"`);
            completePath.push({
              from: flowItem.from,
              to: flowItem.to,
              action: flowItem.action,
              selector: undefined,
            });
          }
        }
      }

      if (completePath.length === 0) {
        logger.warn('RetryService', 'No path to execute');
        retrySession.status = 'completed';
        retrySession.endTime = Date.now();
        return;
      }
      
      logger.info('RetryService', `Executing complete path with ${completePath.length} steps`);

      // Rebuild steps array to match the actual execution path
      // This ensures steps are in sync with what's actually being executed
      const steps: RetryStep[] = [];
      steps.push({
        index: 0,
        description: `Navigate to entry: ${entryUrl}`,
        status: 'pending',
      });
      completePath.forEach((pathItem, idx) => {
        steps.push({
          index: idx + 1,
          description: `${pathItem.action}: ${pathItem.from} → ${pathItem.to}`,
          status: 'pending',
        });
      });
      retrySession.steps = steps;
      logger.info('RetryService', `Rebuilt ${steps.length} steps to match execution path`);
      
      // Notify about all steps being updated (so UI can refresh)
      steps.forEach(step => {
        this.notifyStepUpdate(retryId, step);
      });

      // Step 0: Navigate to entry URL
      await this.executeStep(retryId, 0, async () => {
        logger.info('RetryService', `Navigating to entry URL: ${entryUrl}`);
        await browserTools.navigate(entryUrl);
        await this.delay(1500); // Delay for human readability
      });

      let currentUrl = entryUrl;

      // Execute each action in the complete path
      for (let i = 0; i < completePath.length; i++) {
        const pathItem = completePath[i];
        const stepIndex = i + 1; // Step 0 was navigation

        await this.executeStep(retryId, stepIndex, async () => {
          logger.info('RetryService', `═══════════════════════════════════════════════════════════`);
          logger.info('RetryService', `[STEP ${i + 1}/${completePath.length}] Executing: ${pathItem.action}`);
          logger.info('RetryService', `  From: ${pathItem.from}`);
          logger.info('RetryService', `  To: ${pathItem.to}`);
          logger.info('RetryService', `  Selector: ${pathItem.selector || 'none'}`);
          
          // Navigate to the source state if we're not already there
          if (pathItem.from !== currentUrl) {
            logger.info('RetryService', `[NAVIGATION] Navigating from ${currentUrl} to source state: ${pathItem.from}`);
            await browserTools.navigate(pathItem.from);
            await this.delay(1500);
            currentUrl = pathItem.from;
            logger.info('RetryService', `[NAVIGATION] Successfully navigated to: ${currentUrl}`);
          }
          
          // Use selector from path item (already extracted from graph)
          const selector = pathItem.selector;
          
          // Parse and execute the action from the path item
          const actionLabel = pathItem.action;
          const actionLower = actionLabel.toLowerCase();
          
          logger.info('RetryService', `Parsing action: "${actionLabel}", selector: "${selector || 'none'}"`);
          
          // Check if this is a batch action (contains multiple actions separated by →)
          const batchMatch = actionLabel.match(/Batch:\s*(.+)/i);
          const actionsToProcess = batchMatch 
            ? batchMatch[1].split('→').map(a => a.trim()).filter(a => a)
            : [actionLabel];
          
          logger.info('RetryService', `Found ${actionsToProcess.length} action(s) to execute: ${actionsToProcess.join(' → ')}`);
          
          // Process each action in the batch (or single action) sequentially
          let batchActionIndex = 0;
          for (const singleAction of actionsToProcess) {
            batchActionIndex++;
            const singleActionLower = singleAction.toLowerCase();
            let singleActionExecuted = false;
            
            logger.info('RetryService', `───────────────────────────────────────────────────────────`);
            logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] Processing: "${singleAction}"`);
            
            // Try format 1: Technical format with "tool on selector"
            // Pattern: "clickElement on #selector" or "clickElement on [name='selector']"
            // Match selector until we see "with" or end of string
            const clickMatch = singleAction.match(/clickElement\s+on\s+(.+?)(?:\s+with\s|$)/i);
            if (clickMatch) {
              const selectorString = clickMatch[1].trim();
              const selectorList = this.getSelectorList(selectorString);
              logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Trying clickElement with ${selectorList.length} selector(s): ${selectorList.join(', ')}`);
              
              // Try each selector until one works
              for (const sel of selectorList) {
                try {
                  logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] EXECUTING: clickElement("${sel}")`);
                  await browserTools.clickElement(sel);
                  logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✓ SUCCESS: Clicked element: ${sel}`);
                  singleActionExecuted = true;
                  break;
                } catch (error) {
                  logger.warn('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✗ FAILED: Selector ${sel} failed, trying next...`);
                  // Continue to next selector
                }
              }
            }
            
            // Pattern: "typeText on #selector with text 'value'" or "typeText on #selector with text "value""
            // Improved regex to handle selectors with spaces like [name="username"]
            if (!singleActionExecuted) {
              // Match: typeText on <selector> with text "<value>"
              // Selector can contain spaces, so match until "with text"
              let typeMatch = singleAction.match(/typeText\s+on\s+(.+?)\s+with\s+text\s+["']([^"']+)["']/i);
              // If no match, try: typeText on <selector> "<value>" (without "with text")
              if (!typeMatch) {
                typeMatch = singleAction.match(/typeText\s+on\s+(.+?)\s+["']([^"']+)["']/i);
              }
              if (typeMatch) {
                const selectorString = typeMatch[1].trim();
                const text = typeMatch[2];
                const selectorList = this.getSelectorList(selectorString);
                logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Trying typeText with ${selectorList.length} selector(s): ${selectorList.join(', ')}, text: "${text}"`);
                
                // Try each selector until one works
                for (const sel of selectorList) {
                  try {
                    logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] EXECUTING: typeText("${sel}", "${text}")`);
                    await browserTools.typeText(sel, text);
                    logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✓ SUCCESS: Typed text into: ${sel}`);
                    singleActionExecuted = true;
                    break;
                  } catch (error) {
                    logger.warn('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✗ FAILED: Selector ${sel} failed, trying next...`);
                    // Continue to next selector
                  }
                }
              }
            }
            
            // Pattern: "selectOption on #selector with value 'value'"
            if (!singleActionExecuted) {
              const selectMatch = singleAction.match(/selectOption\s+on\s+(\S+)\s+with\s+value\s+["']([^"']+)["']/i);
              if (selectMatch) {
                const selector = this.cleanSelector(selectMatch[1]);
                const value = selectMatch[2];
                logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] EXECUTING: selectOption("${selector}", "${value}")`);
                await browserTools.selectOption(selector, value);
                logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✓ SUCCESS: Selected option in: ${selector}`);
                singleActionExecuted = true;
              }
            }
            
            // Pattern: "navigate to http://..."
            if (!singleActionExecuted) {
              const navMatch = singleAction.match(/navigate\s+to\s+(https?:\/\/\S+)/i);
              if (navMatch) {
                const url = navMatch[1].trim();
                logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] EXECUTING: navigate("${url}")`);
                await browserTools.navigate(url);
                currentUrl = url;
                logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✓ SUCCESS: Navigated to: ${url}`);
                singleActionExecuted = true;
              }
            }
            
            // If action wasn't executed, try to infer from selector or page
            // Note: For typeText actions in batches, skip selector (it's usually the submit button selector)
            // and go straight to page inference to find the correct field
            if (!singleActionExecuted) {
              const isTypeAction = singleActionLower.includes('type') || singleActionLower.includes('enter') || singleActionLower.includes('fill') || 
                                   singleActionLower.includes('username') || singleActionLower.includes('password') || singleActionLower.includes('input');
              
              // For click actions, try selector first (it's likely correct)
              if (!isTypeAction && selector) {
                const cleanedSelector = this.cleanSelector(selector);
                logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Trying selector for click: ${cleanedSelector}`);
                
                if (singleActionLower.includes('click') || singleActionLower.includes('button') || singleActionLower.includes('submit')) {
                  logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] EXECUTING: clickElement("${cleanedSelector}") [from graph selector]`);
                  await browserTools.clickElement(cleanedSelector);
                  logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✓ SUCCESS: Clicked element: ${cleanedSelector}`);
                  singleActionExecuted = true;
                }
              }
              // For typeText actions, skip selector and go to page inference (next block)
            }
            
            // If still not executed, try to infer from page
            if (!singleActionExecuted) {
              logger.warn('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Action format not recognized, attempting to infer from page: ${singleAction}`);
              const observation = await browserTools.observe();
              const domLines = observation.domState.split('\n');
              
              // Special handling for login/credential actions
              if ((singleActionLower.includes('login') || singleActionLower.includes('credential') || singleActionLower.includes('authenticate')) &&
                  (singleActionLower.includes('complete') || singleActionLower.includes('submit') || singleActionLower.includes('form'))) {
                logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Detected login form submission action`);
                
                // Extract credentials from story steps
                let username: string | undefined;
                let password: string | undefined;
                
                if (story.steps) {
                  for (const step of story.steps) {
                    const stepLower = step.toLowerCase();
                    // Look for "Enter username 'value'" or "Enter username 'value'"
                    if (stepLower.includes('username') || stepLower.includes('user')) {
                      const userMatch = step.match(/username\s+['"]([^'"]+)['"]/i);
                      if (userMatch) {
                        username = userMatch[1];
                      }
                    }
                    // Look for "Enter password 'value'"
                    if (stepLower.includes('password') || stepLower.includes('pass')) {
                      const passMatch = step.match(/password\s+['"]([^'"]+)['"]/i);
                      if (passMatch) {
                        password = passMatch[1];
                      }
                    }
                  }
                }
                
                // If not found in steps, try to extract from action description
                if (!username || !password) {
                  // Try to find credentials in the action or story description
                  const descMatch = (story.description || '').match(/['"]([^'"]+)['"]/g);
                  if (descMatch && descMatch.length >= 2) {
                    username = descMatch[0].replace(/['"]/g, '');
                    password = descMatch[1].replace(/['"]/g, '');
                  }
                }
                
                // Fallback to config credentials if available
                if (!username || !password) {
                  const configCreds = ConfigService.getCredentials();
                  if (configCreds?.username && configCreds?.password) {
                    username = configCreds.username;
                    password = configCreds.password;
                    logger.info('RetryService', `Using credentials from config`);
                  }
                }
                
                if (username && password) {
                  logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Found credentials: username="${username}", password="${'*'.repeat(password.length)}"`);
                  
                  // Find username field
                  let usernameSelector: string | null = null;
                  let passwordSelector: string | null = null;
                  let submitSelector: string | null = null;
                  
                  for (const line of domLines) {
                    const lineLower = line.toLowerCase();
                    
                    // Find username field
                    if (!usernameSelector && (lineLower.includes('input') || lineLower.includes('textarea')) &&
                        (lineLower.includes('username') || lineLower.includes('user')) &&
                        !lineLower.includes('password')) {
                      const selectorMatch = line.match(/Selector:\s*(.+)$/i);
                      if (selectorMatch) {
                        usernameSelector = this.cleanSelector(selectorMatch[1]);
                      }
                    }
                    
                    // Find password field
                    if (!passwordSelector && (lineLower.includes('input') || lineLower.includes('textarea')) &&
                        (lineLower.includes('password') || lineLower.includes('pass') ||
                         (lineLower.includes('type') && lineLower.includes('password')))) {
                      const selectorMatch = line.match(/Selector:\s*(.+)$/i);
                      if (selectorMatch) {
                        passwordSelector = this.cleanSelector(selectorMatch[1]);
                      }
                    }
                    
                    // Find submit button - try specific login button first
                    if (!submitSelector && (lineLower.includes('button') || lineLower.includes('submit')) &&
                        (lineLower.includes('login') || lineLower.includes('sign in') || lineLower.includes('submit'))) {
                      const selectorMatch = line.match(/Selector:\s*(.+)$/i);
                      if (selectorMatch) {
                        submitSelector = this.cleanSelector(selectorMatch[1]);
                      }
                    }
                  }
                  
                  // If still no submit button found, look for any submit button
                  if (!submitSelector) {
                    for (const line of domLines) {
                      const lineLower = line.toLowerCase();
                      if (lineLower.includes('button') && 
                          (lineLower.includes('type') && lineLower.includes('submit'))) {
                        const selectorMatch = line.match(/Selector:\s*(.+)$/i);
                        if (selectorMatch) {
                          submitSelector = this.cleanSelector(selectorMatch[1]);
                          logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Found generic submit button: ${submitSelector}`);
                          break;
                        }
                      }
                    }
                  }
                  
                  // Fallback: use edge selector for submit button if not found
                  if (!submitSelector && selector) {
                    submitSelector = this.cleanSelector(selector);
                    logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Using edge selector for submit button: ${submitSelector}`);
                  }
                  
                  // Execute login sequence
                  if (usernameSelector && passwordSelector && submitSelector) {
                    logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Executing login: username field=${usernameSelector}, password field=${passwordSelector}, submit=${submitSelector}`);
                    
                    // Try multiple selectors for each field
                    const usernameSelectors = this.getSelectorList(usernameSelector);
                    const passwordSelectors = this.getSelectorList(passwordSelector);
                    const submitSelectors = this.getSelectorList(submitSelector);
                    
                    // Fill username
                    let usernameFilled = false;
                    for (const sel of usernameSelectors) {
                      try {
                        await browserTools.typeText(sel, username);
                        logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Filled username in: ${sel}`);
                        usernameFilled = true;
                        break;
                      } catch (error) {
                        logger.warn('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Username selector ${sel} failed, trying next...`);
                      }
                    }
                    
                    if (usernameFilled) {
                      await this.delay(500);
                      
                      // Fill password
                      let passwordFilled = false;
                      for (const sel of passwordSelectors) {
                        try {
                          await browserTools.typeText(sel, password);
                          logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Filled password in: ${sel}`);
                          passwordFilled = true;
                          break;
                        } catch (error) {
                          logger.warn('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Password selector ${sel} failed, trying next...`);
                        }
                      }
                      
                      if (passwordFilled) {
                        await this.delay(500);
                        
                        // Click submit
                        for (const sel of submitSelectors) {
                          try {
                            await browserTools.clickElement(sel);
                            logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Clicked submit: ${sel}`);
                            singleActionExecuted = true;
                            break;
                          } catch (error) {
                            logger.warn('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Submit selector ${sel} failed, trying next...`);
                          }
                        }
                      }
                    }
                  } else {
                    logger.warn('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Could not find all login fields: username=${!!usernameSelector}, password=${!!passwordSelector}, submit=${!!submitSelector}`);
                  }
                } else {
                  logger.warn('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] No credentials found for login action`);
                }
              }
              
              // Try to find clickable elements using general word matching
              if (!singleActionExecuted && (singleActionLower.includes('click') || singleActionLower.includes('button') || singleActionLower.includes('submit'))) {
                // Extract meaningful words from action (filter out common words)
                const commonWords = new Set(['click', 'button', 'to', 'the', 'a', 'an', 'on', 'with', 'and', 'or', 'for', 'in', 'at', 'by']);
                const actionWords = singleAction.toLowerCase()
                  .split(/\s+/)
                  .filter(w => w.length > 2 && !commonWords.has(w));
                
                // Score buttons based on word overlap with action description
                const buttonCandidates: Array<{ selector: string; score: number; line: string }> = [];
                
                for (const line of domLines) {
                  const lineLower = line.toLowerCase();
                  if (lineLower.includes('button') || lineLower.includes('a href')) {
                    const selectorMatch = line.match(/Selector:\s*(.+)$/i);
                    if (selectorMatch) {
                      const selector = this.cleanSelector(selectorMatch[1]);
                      let score = 0;
                      
                      // Count how many action words appear in the button description
                      for (const word of actionWords) {
                        if (lineLower.includes(word)) {
                          score += 1;
                        }
                      }
                      
                      // Bonus for exact phrase matches (if action contains a phrase that appears in button)
                      const actionPhrases = singleAction.toLowerCase()
                        .split(/\s+/)
                        .filter(w => w.length > 3)
                        .slice(0, 3); // Take first few meaningful words
                      
                      for (let i = 0; i < actionPhrases.length - 1; i++) {
                        const phrase = `${actionPhrases[i]} ${actionPhrases[i + 1]}`;
                        if (lineLower.includes(phrase)) {
                          score += 3; // Bonus for phrase match
                        }
                      }
                      
                      if (score > 0) {
                        buttonCandidates.push({ selector, score, line });
                      }
                    }
                  }
                }
                
                // Sort by score (highest first) and try the best match
                buttonCandidates.sort((a, b) => b.score - a.score);
                
                if (buttonCandidates.length > 0) {
                  logger.info('RetryService', `[${batchActionIndex}/${actionsToProcess.length}] Found ${buttonCandidates.length} button candidate(s), trying best match first`);
                }
                
                for (const candidate of buttonCandidates) {
                  try {
                    logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] EXECUTING: clickElement("${candidate.selector}") [inferred, score: ${candidate.score}]`);
                    await browserTools.clickElement(candidate.selector);
                    logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✓ SUCCESS: Clicked inferred element: ${candidate.selector}`);
                    singleActionExecuted = true;
                    break;
                  } catch (error) {
                    logger.warn('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✗ FAILED: Inferred selector ${candidate.selector} failed, trying next...`);
                    // Continue to next candidate
                  }
                }
              }
              
              // Try to find input fields
              if (!singleActionExecuted && (singleActionLower.includes('type') || singleActionLower.includes('enter') || singleActionLower.includes('fill') ||
                  singleActionLower.includes('username') || singleActionLower.includes('password') || singleActionLower.includes('input'))) {
                const actionWords = singleAction.toLowerCase().split(/\s+/);
                const valueMatch = singleAction.match(/["']([^"']+)["']/);
                const value = valueMatch ? valueMatch[1] : '';
                
                // Determine if we're looking for username or password field
                const isUsername = singleActionLower.includes('username') || singleActionLower.includes('user');
                const isPassword = singleActionLower.includes('password') || singleActionLower.includes('pass');
                
                for (const line of domLines) {
                  const lineLower = line.toLowerCase();
                  if (lineLower.includes('input') || lineLower.includes('textarea')) {
                    // Check if this is the right type of input field
                    let isCorrectField = false;
                    
                    if (isUsername) {
                      // Looking for username field - check for username indicators
                      isCorrectField = lineLower.includes('username') || 
                                      lineLower.includes('user') ||
                                      (lineLower.includes('autocomplete') && lineLower.includes('username')) ||
                                      (lineLower.includes('type') && !lineLower.includes('password') && !lineLower.includes('submit') && !lineLower.includes('button'));
                    } else if (isPassword) {
                      // Looking for password field - check for password indicators
                      isCorrectField = lineLower.includes('password') || 
                                      lineLower.includes('pass') ||
                                      (lineLower.includes('type') && lineLower.includes('password')) ||
                                      (lineLower.includes('autocomplete') && lineLower.includes('password'));
                    } else {
                      // Generic input - try to match by keywords
                      isCorrectField = actionWords.some(word => {
                        if (word.length <= 3) return false;
                        return lineLower.includes(word) || 
                               (word.includes('user') && lineLower.includes('user')) ||
                               (word.includes('pass') && lineLower.includes('pass'));
                      });
                    }
                    
                    if (isCorrectField) {
                      const selectorMatch = line.match(/Selector:\s*(.+)$/i);
                      if (selectorMatch && value) {
                        const selector = this.cleanSelector(selectorMatch[1]);
                        logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] EXECUTING: typeText("${selector}", "${value}") [inferred, field: ${isUsername ? 'username' : isPassword ? 'password' : 'generic'}]`);
                        await browserTools.typeText(selector, value);
                        logger.info('RetryService', `[ACTION ${batchActionIndex}/${actionsToProcess.length}] ✓ SUCCESS: Typed text into inferred field: ${selector}`);
                        singleActionExecuted = true;
                        break;
                      }
                    }
                  }
                }
              }
            }
            
            // If this single action failed, throw error
            if (!singleActionExecuted) {
              throw new Error(`Unable to parse or execute action ${batchActionIndex}/${actionsToProcess.length}: ${singleAction}`);
            }
            
            // Small delay between batch actions (except after the last one)
            if (batchActionIndex < actionsToProcess.length) {
              await this.delay(500);
            }
          }
          
          // All actions in batch executed successfully
          // Update current URL to the target state after all batch actions
          currentUrl = pathItem.to;
          logger.info('RetryService', `[STEP ${i + 1}/${completePath.length}] ✓ COMPLETED: All actions executed, current URL: ${currentUrl}`);
          logger.info('RetryService', `═══════════════════════════════════════════════════════════`);
          
          await this.delay(1500); // Delay for human readability after batch
        });
      }

      // Mark retry as completed
      retrySession.status = 'completed';
      retrySession.endTime = Date.now();
      logger.info('RetryService', `Retry completed successfully: ${retryId}`);
      
      // Keep browser open a bit longer so user can see the final result
      logger.info('RetryService', 'Keeping browser open for 3 seconds to show final result...');
      await this.delay(3000);
    } catch (error) {
      logger.error('RetryService', 'Error in retry execution', {
        retryId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      retrySession.status = 'failed';
      retrySession.endTime = Date.now();
      
      // Keep browser open a bit longer on failure too, so user can see what went wrong
      logger.info('RetryService', 'Keeping browser open for 3 seconds to show error state...');
      await this.delay(3000);
      throw error;
    } finally {
      await browserTools.close();
      logger.info('RetryService', 'Browser closed for retry');
    }
  }

  /**
   * Execute a single step with error handling
   */
  private static async executeStep(
    retryId: string,
    stepIndex: number,
    stepFunction: () => Promise<void>
  ): Promise<void> {
    const retrySession = this.retrySessions.get(retryId);
    if (!retrySession) {
      throw new Error('Retry session not found');
    }

    const step = retrySession.steps[stepIndex];
    if (!step) {
      throw new Error(`Step ${stepIndex} not found in retry session`);
    }

    step.status = 'running';
    step.timestamp = Date.now();
    this.notifyStepUpdate(retryId, step);

    try {
      await stepFunction();
      step.status = 'completed';
      this.notifyStepUpdate(retryId, step);
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      this.notifyStepUpdate(retryId, step);
      throw error;
    }
  }

  /**
   * Notify callback of step update
   */
  private static notifyStepUpdate(retryId: string, step: RetryStep) {
    if (this.onStepUpdateCallback) {
      this.onStepUpdateCallback(retryId, step);
    }
  }

  /**
   * Clean and normalize a CSS selector
   * Removes trailing commas, whitespace, and other invalid characters
   */
  private static cleanSelector(selector: string): string {
    if (!selector) return selector;
    
    // Remove trailing commas and whitespace
    let cleaned = selector.trim().replace(/,\s*$/, '');
    
    // If selector contains multiple selectors separated by commas, take the first one
    // This handles cases like "button[type="submit"], .login-button"
    const firstSelector = cleaned.split(',')[0].trim();
    
    return firstSelector;
  }

  /**
   * Get all selectors from a comma-separated selector string
   * Returns array of individual selectors to try
   */
  private static getSelectorList(selector: string): string[] {
    if (!selector) return [];
    
    // Split by comma and clean each selector
    return selector.split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => this.cleanSelector(s));
  }

  /**
   * Delay utility for human-readable execution
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get retry session status
   */
  static getRetrySession(retryId: string): RetrySession | undefined {
    return this.retrySessions.get(retryId);
  }

  /**
   * Get all retry sessions for a session
   */
  static getRetrySessionsBySessionId(sessionId: string): RetrySession[] {
    return Array.from(this.retrySessions.values()).filter((retry) => retry.sessionId === sessionId);
  }
}

