import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  EdgeTypes,
  BaseEdge,
  EdgeProps,
  getSmoothStepPath,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import './App.css';
import RetryProgressPanel from './RetryProgressPanel';

// Action type configuration for better edge styling
interface ActionTypeConfig {
  color: string;
  strokeWidth: number;
  strokeDasharray?: string;
  icon: string;
  labelColor: string;
}

const ACTION_TYPE_CONFIGS: Record<string, ActionTypeConfig> = {
  click: {
    color: '#3b82f6', // Blue
    strokeWidth: 2.5,
    icon: '👆',
    labelColor: '#1e40af',
  },
  type: {
    color: '#10b981', // Green
    strokeWidth: 2.5,
    icon: '⌨️',
    labelColor: '#065f46',
  },
  select: {
    color: '#8b5cf6', // Purple
    strokeWidth: 2.5,
    icon: '📋',
    labelColor: '#5b21b6',
  },
  navigate: {
    color: '#f59e0b', // Amber
    strokeWidth: 2.5,
    strokeDasharray: '8,4',
    icon: '🧭',
    labelColor: '#92400e',
  },
  action: {
    color: '#667eea', // Default purple
    strokeWidth: 2,
    icon: '⚡',
    labelColor: '#4c1d95',
  },
};

function getActionTypeConfig(label: string): ActionTypeConfig {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('click')) return ACTION_TYPE_CONFIGS.click;
  if (lowerLabel.includes('type')) return ACTION_TYPE_CONFIGS.type;
  if (lowerLabel.includes('select')) return ACTION_TYPE_CONFIGS.select;
  if (lowerLabel.includes('navigate')) return ACTION_TYPE_CONFIGS.navigate;
  return ACTION_TYPE_CONFIGS.action;
}

// Custom edge component for transition edges with enhanced styling
function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  labelStyle,
  data,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const fullLabel = (data as any)?.fullLabel || label;
  const actionConfig = (data as any)?.actionConfig || ACTION_TYPE_CONFIGS.action;
  
  const [edgePath, labelX, labelY] = useMemo(() => {
    return getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  const displayLabel = typeof label === 'string' ? label : '';
  const shortLabel = displayLabel.length > 15 ? `${displayLabel.substring(0, 12)}...` : displayLabel;

  return (
    <g>
      {/* Invisible wider path for easier hover interaction on the edge */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={30}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: actionConfig.color,
          strokeWidth: isHovered ? actionConfig.strokeWidth + 0.5 : actionConfig.strokeWidth,
          strokeDasharray: actionConfig.strokeDasharray,
          opacity: isHovered ? 1 : 0.85,
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }}
      />
      {label && (
        <g>
          {/* Calculate label dimensions */}
          {(() => {
            const labelWidth = shortLabel.length * 5.5 + 32; // Account for icon and padding
            const labelHeight = 24;
            const labelStartX = labelX - labelWidth / 2;
            const labelStartY = labelY - labelHeight / 2;
            
            return (
              <>
                {/* Label background with better styling - also a hover target */}
                <rect
                  x={labelStartX}
                  y={labelStartY}
                  width={labelWidth}
                  height={labelHeight}
                  rx={6}
                  fill={isHovered ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.95)'}
                  stroke={actionConfig.color}
                  strokeWidth={isHovered ? 2 : 1.5}
                  style={{ transition: 'all 0.2s ease', cursor: 'pointer' }}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                />
                {/* Icon */}
                <text
                  x={labelStartX + 12}
                  y={labelY + 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontSize: '12px', cursor: 'pointer', pointerEvents: 'none' }}
                >
                  {actionConfig.icon}
                </text>
                {/* Label text */}
                <text
                  x={labelStartX + 28}
                  y={labelY + 2}
                  textAnchor="start"
                  dominantBaseline="middle"
                  style={{
                    ...labelStyle,
                    fill: actionConfig.labelColor,
                    fontWeight: isHovered ? 600 : 500,
                    fontSize: '11px',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    pointerEvents: 'none',
                  }}
                  className="react-flow__edge-text"
                >
                  {shortLabel}
                </text>
                {/* Hover tooltip with full label - shows when hovering edge or label */}
                {isHovered && fullLabel && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={labelX - (fullLabel.length * 3.5)}
                      y={labelY - 40}
                      width={fullLabel.length * 7 + 16}
                      height={22}
                      rx={4}
                      fill="rgba(0, 0, 0, 0.9)"
                      stroke={actionConfig.color}
                      strokeWidth={1.5}
                    />
                    <text
                      x={labelX}
                      y={labelY - 27}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{
                        fill: 'white',
                        fontSize: '11px',
                        fontWeight: 500,
                        pointerEvents: 'none',
                      }}
                    >
                      {fullLabel}
                    </text>
                  </g>
                )}
              </>
            );
          })()}
        </g>
      )}
    </g>
  );
}

// Custom edge component for self-loops with enhanced styling
function SelfLoopEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  labelStyle,
  data,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const fullLabel = (data as any)?.fullLabel || label;
  const actionConfig = (data as any)?.actionConfig || ACTION_TYPE_CONFIGS.action;
  const offset = (data as any)?.offset || 60;
  const radius = offset;
  
  const [edgePath, labelX, labelY, hoverPath] = useMemo(() => {
    // Create a proper circular/elliptical loop on the side of the node
    const loopIndex = (data as any)?.loopIndex || 0;
    const nodeWidth = 250; // Approximate node width
    const nodeHeight = 100; // Approximate node height
    
    // Position loops on the right side of the node, offset vertically for multiple loops
    // Center the first loop vertically, then offset others above/below
    let verticalOffset = 0;
    if (loopIndex > 0) {
      // Alternate above and below: 1st extra = +30, 2nd extra = -30, 3rd = +60, 4th = -60, etc.
      const offsetDirection = loopIndex % 2 === 1 ? 1 : -1;
      const offsetAmount = Math.ceil(loopIndex / 2) * 30;
      verticalOffset = offsetDirection * offsetAmount;
    }
    
    // Create a proper circular loop path on the right side
    // Start from right-center of node, go right and around in a circle, end back at right-center
    const startX = sourceX + nodeWidth / 2;
    const startY = sourceY + verticalOffset; // sourceY is the vertical center of the node
    const rightX = startX + radius;
    const centerY = sourceY + verticalOffset;
    
    // Create a smooth circular loop using cubic bezier curves
    // The loop goes: start (right-center) -> right and up -> right -> right and down -> back to start
    // Use control points to create a nice circular arc
    const topControlX = startX + radius * 0.55;
    const topControlY = startY - radius * 0.45;
    const rightTopX = rightX;
    const rightTopY = centerY - radius * 0.4;
    
    const rightBottomX = rightX;
    const rightBottomY = centerY + radius * 0.4;
    const bottomControlX = startX + radius * 0.55;
    const bottomControlY = startY + radius * 0.45;
    
    // Create a smooth closed loop using cubic bezier curves
    // Path: start -> curve right-up -> right -> curve right-down -> back to start
    const path = `M ${startX} ${startY} 
                  C ${topControlX} ${topControlY}, ${rightTopX} ${rightTopY}, ${rightX} ${centerY}
                  C ${rightBottomX} ${rightBottomY}, ${bottomControlX} ${bottomControlY}, ${startX} ${startY} Z`;
    
    // Create a wider hover path for easier interaction (same path, just for hover detection)
    const hoverPath = path;
    
    // Label position at the right side of the loop
    return [path, rightX + 15, centerY, hoverPath];
  }, [sourceX, sourceY, radius, data]);

  const displayLabel = typeof label === 'string' ? label : '';
  const shortLabel = displayLabel.length > 15 ? `${displayLabel.substring(0, 12)}...` : displayLabel;

  return (
    <g>
      {/* Invisible wider path for easier hover interaction on the edge */}
      <path
        d={hoverPath}
        fill="none"
        stroke="transparent"
        strokeWidth={30}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: actionConfig.color,
          strokeWidth: isHovered ? actionConfig.strokeWidth + 0.5 : actionConfig.strokeWidth,
          strokeDasharray: actionConfig.strokeDasharray || style.strokeDasharray,
          opacity: isHovered ? 1 : 0.85,
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }}
      />
      {label && (
        <g>
          {/* Calculate label dimensions */}
          {(() => {
            const labelWidth = shortLabel.length * 5.5 + 32;
            const labelHeight = 24;
            const labelStartX = labelX - labelWidth / 2;
            const labelStartY = labelY - labelHeight / 2;
            
            return (
              <>
                {/* Label background with better styling - also a hover target */}
                <rect
                  x={labelStartX}
                  y={labelStartY}
                  width={labelWidth}
                  height={labelHeight}
                  rx={6}
                  fill={isHovered ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.95)'}
                  stroke={actionConfig.color}
                  strokeWidth={isHovered ? 2 : 1.5}
                  style={{ transition: 'all 0.2s ease', cursor: 'pointer' }}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                />
                {/* Icon */}
                <text
                  x={labelStartX + 12}
                  y={labelY + 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontSize: '12px', cursor: 'pointer', pointerEvents: 'none' }}
                >
                  {actionConfig.icon}
                </text>
                {/* Label text */}
                <text
                  x={labelStartX + 28}
                  y={labelY + 2}
                  textAnchor="start"
                  dominantBaseline="middle"
                  style={{
                    ...labelStyle,
                    fill: actionConfig.labelColor,
                    fontWeight: isHovered ? 600 : 500,
                    fontSize: '11px',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    pointerEvents: 'none',
                  }}
                  className="react-flow__edge-text"
                >
                  {shortLabel}
                </text>
                {/* Hover tooltip with full label - shows when hovering edge or label */}
                {isHovered && fullLabel && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={labelX - (fullLabel.length * 3.5)}
                      y={labelY - 40}
                      width={fullLabel.length * 7 + 16}
                      height={22}
                      rx={4}
                      fill="rgba(0, 0, 0, 0.9)"
                      stroke={actionConfig.color}
                      strokeWidth={1.5}
                    />
                    <text
                      x={labelX}
                      y={labelY - 27}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{
                        fill: 'white',
                        fontSize: '11px',
                        fontWeight: 500,
                        pointerEvents: 'none',
                      }}
                    >
                      {fullLabel}
                    </text>
                  </g>
                )}
              </>
            );
          })()}
        </g>
      )}
    </g>
  );
}

const edgeTypes: EdgeTypes = {
  transition: TransitionEdge,
  selfloop: SelfLoopEdge,
};

interface UserStory {
  title: string;
  description: string;
  steps: string[];
  flow: Array<{
    from: string;
    to: string;
    action: string;
  }>;
}

interface UserStoriesResult {
  stories: UserStory[];
  summary: string;
}

interface Session {
  sessionId: string;
  status: string;
  hasState: boolean;
  url?: string;
  createdAt?: string | Date;
  currentState?: {
    currentUrl?: string;
    actionHistory?: string[];
    explorationStatus?: string;
  };
  decisions?: string[]; // Agent decisions for display
  userStories?: UserStoriesResult; // Compiled user stories
}

interface SessionGraphCounts {
  nodes: number;
  edges: number;
}

interface GraphData {
  nodes: Array<{ id: string; label: string; url: string }>;
  edges: Array<{ source: string; target: string; label: string }>;
}

interface RetryStep {
  index: number;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  timestamp?: number;
}

interface RetrySession {
  retryId: string;
  sessionId: string;
  storyIndex: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: RetryStep[];
  startTime: number;
  endTime?: number;
}

function App() {
  const [url, setUrl] = useState('http://localhost:5173/');
  const [maxIterations, setMaxIterations] = useState<number | undefined>(undefined); // Will be loaded from config
  const [appUsername, setAppUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [agentActivity, setAgentActivity] = useState<string[]>([]);
  const [flowNodes, setFlowNodes] = useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [userStories, setUserStories] = useState<UserStoriesResult | null>(null);
  const [currentRetry, setCurrentRetry] = useState<RetrySession | null>(null);
  const [sessionGraphCounts, setSessionGraphCounts] = useState<Map<string, SessionGraphCounts>>(new Map());

  // Convert graph data to ReactFlow format with Dagre hierarchical layout
  useEffect(() => {
    if (graphData && graphData.nodes.length > 0) {
      // Separate self-loops from regular edges
      const selfLoopsByNode = new Map<string, Array<GraphData['edges'][0]>>();
      const regularEdges: Array<GraphData['edges'][0]> = [];
      
      graphData.edges.forEach(edge => {
        if (edge.source === edge.target) {
          if (!selfLoopsByNode.has(edge.source)) {
            selfLoopsByNode.set(edge.source, []);
          }
          selfLoopsByNode.get(edge.source)!.push(edge);
        } else {
          regularEdges.push(edge);
        }
      });

      // Create Dagre graph for layout
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ 
        rankdir: 'TB', // Top to bottom
        nodesep: 100,  // Horizontal spacing between nodes
        ranksep: 150,  // Vertical spacing between ranks
        marginx: 50,
        marginy: 50,
      });

      // Add nodes to Dagre graph
      graphData.nodes.forEach(node => {
        g.setNode(node.id, { 
          width: 250, 
          height: 100 
        });
      });

      // Add only regular edges to Dagre (no self-loops)
      regularEdges.forEach(edge => {
        g.setEdge(edge.source, edge.target);
      });

      // Calculate layout
      dagre.layout(g);

      // Count connections for node styling
      const connectionCounts = new Map<string, { in: number; out: number; self: number }>();
      graphData.nodes.forEach(node => {
        connectionCounts.set(node.id, { in: 0, out: 0, self: 0 });
      });
      
      graphData.edges.forEach(edge => {
        if (edge.source === edge.target) {
          const counts = connectionCounts.get(edge.source)!;
          counts.self++;
        } else {
          const sourceCounts = connectionCounts.get(edge.source)!;
          sourceCounts.out++;
          const targetCounts = connectionCounts.get(edge.target)!;
          targetCounts.in++;
        }
      });

      // Create ReactFlow nodes with Dagre positions
      const nodes: Node[] = graphData.nodes.map(node => {
        const dagreNode = g.node(node.id);
        const counts = connectionCounts.get(node.id)!;
        const totalConnections = counts.in + counts.out;
        const hasSelfLoops = counts.self > 0;
        
        // Format URL for display
        const urlParts = node.url.split('/');
        const displayUrl = urlParts.length > 1 
          ? urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2] || node.url
          : node.url;
        const shortUrl = displayUrl.length > 40 ? `${displayUrl.substring(0, 40)}...` : displayUrl;
        
        return {
          id: node.id,
          type: 'default',
          position: { x: dagreNode.x - 125, y: dagreNode.y - 50 }, // Center the node
          data: {
            label: (
              <div style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  marginBottom: '6px', 
                  wordBreak: 'break-word',
                  fontSize: '0.9rem',
                  color: '#333',
                }}>
                  {shortUrl}
                </div>
                <div style={{ 
                  fontSize: '0.7rem', 
                  color: '#666',
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}>
                  <span>↗ {counts.out}</span>
                  <span>↙ {counts.in}</span>
                  {hasSelfLoops && (
                    <span style={{ color: '#f59e0b' }}>↻ {counts.self}</span>
                  )}
                </div>
              </div>
            ),
          },
          style: {
            background: hasSelfLoops ? '#fff8e1' : '#fff',
            border: hasSelfLoops ? '2px solid #f59e0b' : '2px solid #667eea',
            borderRadius: '8px',
            padding: '12px',
            width: 250,
            boxShadow: totalConnections > 10 ? '0 4px 12px rgba(102, 126, 234, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
        };
      });

      // Create ReactFlow edges
      const edges: Edge[] = [];
      
      // Add regular edges with enhanced styling
      regularEdges.forEach((edge, index) => {
        // Extract action type from label
        const fullLabel = edge.label || 'action';
        const actionConfig = getActionTypeConfig(fullLabel);
        
        // Create a shorter label for display
        let shortLabel = fullLabel;
        if (fullLabel.length > 15) {
          shortLabel = fullLabel.substring(0, 12) + '...';
        }
        
        edges.push({
          id: `e-${edge.source}-${edge.target}-${index}`,
          source: edge.source,
          target: edge.target,
          type: 'transition',
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: actionConfig.color,
            width: 22,
            height: 22,
          },
          style: {
            stroke: actionConfig.color,
            strokeWidth: actionConfig.strokeWidth,
            strokeDasharray: actionConfig.strokeDasharray,
            opacity: 0.85,
          },
          label: shortLabel,
          labelStyle: {
            fill: actionConfig.labelColor,
            fontWeight: 500,
            fontSize: '11px',
          },
          labelShowBg: false, // We handle background in custom component
          data: {
            fullLabel: fullLabel,
            actionConfig: actionConfig,
          },
        });
      });

      // Add individual self-loop edges for each action
      selfLoopsByNode.forEach((loops, nodeId) => {
        loops.forEach((loop, loopIndex) => {
          const fullLabel = loop.label || 'self-loop';
          const actionConfig = getActionTypeConfig(fullLabel);
          
          // Create a shorter label for display
          let shortLabel = fullLabel;
          if (fullLabel.length > 15) {
            shortLabel = fullLabel.substring(0, 12) + '...';
          }
          
          // Offset each self-loop to avoid overlap
          // First loop at 60px, subsequent loops at 60 + (index * 40)px
          const offset = 60 + (loopIndex * 40);
          
          edges.push({
            id: `selfloop-${nodeId}-${loopIndex}`,
            source: nodeId,
            target: nodeId,
            type: 'selfloop',
            animated: false,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: actionConfig.color,
              width: 22,
              height: 22,
            },
            style: {
              stroke: actionConfig.color,
              strokeWidth: actionConfig.strokeWidth,
              strokeDasharray: actionConfig.strokeDasharray,
              opacity: 0.85,
            },
            label: shortLabel,
            labelStyle: {
              fill: actionConfig.labelColor,
              fontWeight: 500,
              fontSize: '11px',
            },
            labelShowBg: false, // We handle background in custom component
            data: {
              offset: offset,
              loopIndex: loopIndex,
              fullLabel: fullLabel,
              actionConfig: actionConfig,
            },
          });
        });
      });

      setFlowNodes(nodes);
      setFlowEdges(edges);
    } else {
      setFlowNodes([]);
      setFlowEdges([]);
    }
  }, [graphData]);

  useEffect(() => {
    // Load configuration from API
    const loadConfig = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/config');
        if (response.ok) {
          const config = await response.json();
          if (config.startingUrl) {
            setUrl(config.startingUrl);
          }
          // Only set maxIterations from config if user hasn't explicitly set it
          if (config.maxIterations && maxIterations === undefined) {
            setMaxIterations(config.maxIterations);
          }
        }
      } catch (error) {
        console.error('Error loading config:', error);
      }
    };

    // Load credentials from API
    const loadCredentials = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/credentials');
        if (response.ok) {
          const credentials = await response.json();
          // Prefill credentials if they exist in config
          if (credentials.username) {
            setAppUsername(credentials.username);
          }
          if (credentials.password) {
            setAppPassword(credentials.password);
          }
        }
      } catch (error) {
        console.error('Error loading credentials:', error);
      }
    };

    loadConfig();
    loadCredentials();

    // Connect to WebSocket
    const websocket = new WebSocket('ws://localhost:3001/ws');
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      addActivity('🔌 Connected to agent monitoring');
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket message:', data);

      if (data.type === 'exploration_complete' || data.type === 'exploration_error') {
        setLoading(false);
        addActivity(`✅ Exploration ${data.type === 'exploration_complete' ? 'completed' : 'failed'}`);
        loadSessions();
        // Reload graph for current session if one is selected
        if (currentSession) {
          loadGraph(currentSession);
        }
      } else if (data.type === 'retry_step_update') {
        // Handle retry step updates
        if (currentRetry && currentRetry.retryId === data.retryId) {
          setCurrentRetry((prev) => {
            if (!prev) return null;
            const updatedSteps = [...prev.steps];
            const stepIndex = updatedSteps.findIndex((s) => s.index === data.step.index);
            if (stepIndex >= 0) {
              updatedSteps[stepIndex] = data.step;
            }
            return { ...prev, steps: updatedSteps };
          });
        }
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);

    // Load initial data (config and credentials already loaded above)
    loadSessions();
    // Don't load graph on initial load - wait for session selection

    return () => {
      websocket.close();
    };
  }, []);

  // Auto-select first session when sessions are loaded and no session is selected
  useEffect(() => {
    if (sessions.length > 0 && currentSession === null) {
      setCurrentSession(sessions[0].sessionId);
    }
  }, [sessions, currentSession]);

          // Poll current session for real-time updates
          useEffect(() => {
            if (!currentSession) {
              // Clear graph when no session is selected
              setGraphData(null);
              setUserStories(null);
              return;
            }

            // Clear old graph data when switching sessions to prevent showing stale data
            setGraphData(null);
            
            // Load graph for the selected session immediately
            loadGraph(currentSession);
            
            // Load user stories immediately when switching sessions
            const loadUserStories = async () => {
              try {
                const response = await fetch(`http://localhost:3001/api/session/${currentSession}`);
                if (response.ok) {
                  const session: Session = await response.json();
                  console.log('Session data loaded:', { 
                    sessionId: session.sessionId, 
                    hasUserStories: !!session.userStories,
                    userStories: session.userStories 
                  });
                  if (session.userStories) {
                    setUserStories(session.userStories);
                  } else {
                    setUserStories(null);
                  }
                }
              } catch (error) {
                console.error('Error loading user stories:', error);
                setUserStories(null);
              }
            };
            
            loadUserStories();

            let lastDecisionCount = 0;
            let sessionStatus: string | null = null;
            let intervalId: NodeJS.Timeout | null = null;
            let isCompleted = false;

            const pollSession = async () => {
              try {
                const response = await fetch(`http://localhost:3001/api/session/${currentSession}`);
                if (response.ok) {
                  const session: Session = await response.json();
                  const previousStatus = sessionStatus;
                  sessionStatus = session.status;
                  
                  // Check if session just completed
                  const justCompleted = (previousStatus === 'running' || previousStatus === null) && 
                                       (session.status === 'completed' || session.status === 'error');
                  
                  // Update activity feed with new decisions (agent decisions)
                  if (session.decisions && Array.isArray(session.decisions)) {
                    const newDecisions = session.decisions.slice(lastDecisionCount);
                    newDecisions.forEach((decision) => {
                      addActivity(decision);
                    });
                    lastDecisionCount = session.decisions.length;
                  }

                  // Update user stories if available (always check, not just when completed)
                  if (session.userStories) {
                    setUserStories(session.userStories);
                  }

                  // Update sessions list
                  loadSessions();
                  
                  // Reload graph periodically for this session
                  if (session.status === 'running') {
                    loadGraph(currentSession);
                  }

                  // Handle completed/error sessions
                  if (session.status === 'completed' || session.status === 'error') {
                    setLoading(false);
                    loadGraph(currentSession);
                    // Add final decisions if any
                    if (session.decisions && session.decisions.length > lastDecisionCount) {
                      session.decisions.slice(lastDecisionCount).forEach((decision) => {
                        addActivity(decision);
                      });
                    }
                    // Ensure user stories are loaded when completed
                    if (session.userStories) {
                      setUserStories(session.userStories);
                    }
                    
                    // Switch to slow polling when session completes
                    if (justCompleted && intervalId) {
                      clearInterval(intervalId);
                      intervalId = null;
                      isCompleted = true;
                      // Start slow polling (every 30 seconds) for completed sessions
                      intervalId = setInterval(pollSession, 30000);
                    }
                  }
                }
              } catch (error) {
                console.error('Error polling session:', error);
              }
            };

            // Initial poll
            pollSession().then(() => {
              // Start polling based on initial session status
              if (!isCompleted && sessionStatus === 'running') {
                intervalId = setInterval(pollSession, 500); // Poll every 500ms for running sessions
              } else {
                // For completed/error sessions, poll much less frequently (every 30 seconds)
                intervalId = setInterval(pollSession, 30000); // Poll every 30s for completed sessions
              }
            });

            return () => {
              if (intervalId) {
                clearInterval(intervalId);
              }
            };
          }, [currentSession]);

  const addActivity = useCallback((message: string) => {
    setAgentActivity((prev) => {
      const newActivity = [...prev, `[${new Date().toLocaleTimeString()}] ${message}`];
      // Keep only last 50 activities
      return newActivity.slice(-50);
    });
  }, []);

  const loadGraphCounts = async (sessionId: string): Promise<SessionGraphCounts> => {
    try {
      const response = await fetch(`http://localhost:3001/api/graph?limit=10000&sessionId=${encodeURIComponent(sessionId)}`);
      if (response.ok) {
        const graphData: GraphData = await response.json();
        return {
          nodes: graphData.nodes.length,
          edges: graphData.edges.length,
        };
      }
    } catch (error) {
      console.error(`Error loading graph counts for session ${sessionId}:`, error);
    }
    return { nodes: 0, edges: 0 };
  };

  const loadSessions = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sessions');
      const data = await response.json();
      const sessionsList: Session[] = data.sessions;
      setSessions(sessionsList);
      
      // Load graph counts for all sessions in parallel
      const countsPromises = sessionsList.map(async (session) => {
        const counts = await loadGraphCounts(session.sessionId);
        return { sessionId: session.sessionId, counts };
      });
      
      const countsResults = await Promise.all(countsPromises);
      const countsMap = new Map<string, SessionGraphCounts>();
      countsResults.forEach(({ sessionId, counts }) => {
        countsMap.set(sessionId, counts);
      });
      setSessionGraphCounts(countsMap);
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  const loadGraph = async (sessionId?: string) => {
    try {
      let url = 'http://localhost:3001/api/graph?limit=200';
      if (sessionId) {
        url += `&sessionId=${encodeURIComponent(sessionId)}`;
      }
      const response = await fetch(url);
      const data = await response.json();
      setGraphData(data);
    } catch (error) {
      console.error('Error loading graph:', error);
    }
  };

  const handleStartExploration = async () => {
    if (!url) {
      alert('Please enter a URL');
      return;
    }

    setLoading(true);
    setAgentActivity([]);
    addActivity('🚀 Starting agentic web operator...');
    
    try {
      const response = await fetch('http://localhost:3001/api/explore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          // Only send maxIterations if it's explicitly set by user, otherwise let backend use .env value
          maxIterations: maxIterations || undefined,
          credentials: appUsername || appPassword ? {
            username: appUsername,
            password: appPassword,
          } : undefined,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setCurrentSession(data.sessionId);
        addActivity(`📡 Agent session started: ${data.sessionId}`);
        addActivity(`🌐 Target URL: ${url}`);
        addActivity('🔍 Beginning data-driven analysis...');
      } else {
        addActivity(`❌ Error: ${data.error || data.message}`);
        alert(`Error: ${data.error || data.message}`);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error starting exploration:', error);
      addActivity(`❌ Failed to start exploration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      alert('Failed to start exploration');
      setLoading(false);
    }
  };

  const handleStopSession = async (sessionId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/session/${sessionId}/stop`, {
        method: 'POST',
      });

      if (response.ok) {
        addActivity(`⏹️ Session stopped: ${sessionId}`);
        loadSessions();
        if (currentSession === sessionId) {
          setCurrentSession(null);
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('Error stopping session:', error);
    }
  };

  const handleRetryStory = async (storyIndex: number) => {
    if (!currentSession) {
      alert('No session selected');
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: currentSession,
          storyIndex,
          credentials: appUsername || appPassword ? {
            username: appUsername,
            password: appPassword,
          } : undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        addActivity(`🔄 Retry started for story ${storyIndex + 1}`);
        
        // Poll for retry status
        pollRetryStatus(data.retryId);
      } else {
        const error = await response.json();
        alert(`Failed to start retry: ${error.message || error.error}`);
      }
    } catch (error) {
      console.error('Error starting retry:', error);
      alert('Failed to start retry');
    }
  };

  const pollRetryStatus = async (retryId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/retry/${retryId}`);
      
      if (response.ok) {
        const retrySession: RetrySession = await response.json();
        setCurrentRetry(retrySession);
        
        // Continue polling if retry is still running
        if (retrySession.status === 'running' || retrySession.status === 'pending') {
          setTimeout(() => pollRetryStatus(retryId), 500);
        } else {
          addActivity(`✅ Retry ${retrySession.status} for story ${retrySession.storyIndex + 1}`);
        }
      }
    } catch (error) {
      console.error('Error polling retry status:', error);
    }
  };

  const activeSession = sessions.find((s) => s.sessionId === currentSession);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🤖 DAV.ai</h1>
        <div className="header-concepts">
          <div className="concept-item">
            <strong>Data-driven</strong>
          </div>
          <div className="concept-item">
            <strong>Agent</strong>
          </div>
          <div className="concept-item">
            <strong>Visualization</strong>
          </div>
        </div>
      </header>

      <main className="app-main">
        {/* Agent Control Panel */}
        <section className="control-panel">
          <h2>🎮 Agent Control</h2>
          <div className="narrative-box">
            <p><strong>Agentic Web Operator:</strong> Autonomous system that navigates, interacts with, and understands web applications through data-driven analysis.</p>
          </div>
          <div className="form-group">
            <label htmlFor="url">Target URL:</label>
            <input
              id="url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:5173/"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="iterations">Max Iterations:</label>
            <input
              id="iterations"
              type="number"
              value={maxIterations ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setMaxIterations(val ? parseInt(val, 10) : undefined);
              }}
              placeholder="Uses .env MAX_ITERATIONS if empty"
              min="1"
              max="100"
              disabled={loading}
            />
            {maxIterations === undefined && (
              <small style={{ display: 'block', marginTop: '0.25rem', color: '#666', fontSize: '0.85rem' }}>
                Will use value from .env (currently: loading...)
              </small>
            )}
          </div>
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '2px solid #e0e0e0' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#555' }}>🔐 App Credentials (Optional)</h3>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
              If the agent encounters a login screen, it will automatically use these credentials.
            </p>
            <div className="form-group">
              <label htmlFor="appUsername">Username:</label>
              <input
                id="appUsername"
                type="text"
                value={appUsername}
                onChange={(e) => setAppUsername(e.target.value)}
                placeholder="e.g., admin"
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label htmlFor="appPassword">Password:</label>
              <input
                id="appPassword"
                type="password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder="e.g., admin123"
                disabled={loading}
              />
            </div>
          </div>
          <button
            onClick={handleStartExploration}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? '🔄 Agent Operating...' : '🚀 Deploy Agent'}
          </button>
          {activeSession && (
            <div className="session-status">
              <div className="status-indicator">
                <span className={`status-dot status-${activeSession.status}`}></span>
                <span>Status: <strong>{activeSession.status}</strong></span>
              </div>
              {activeSession.currentState?.currentUrl && (
                <div className="current-url">
                  Current: {activeSession.currentState.currentUrl.length > 50 
                    ? `${activeSession.currentState.currentUrl.substring(0, 50)}...`
                    : activeSession.currentState.currentUrl}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Data-Driven Activity Feed */}
        <section className="activity-panel">
          <h2>📊 Data-Driven Analysis</h2>
          <div className="narrative-box">
            <p><strong>Data-Driven:</strong> Real-time analysis of user actions, responses, and behavior patterns to understand application flow.</p>
          </div>
          <div className="activity-feed">
            {agentActivity.length === 0 ? (
              <p className="empty-state">No activity yet. Deploy the agent to see data-driven analysis.</p>
            ) : (
              agentActivity.map((activity, index) => (
                <div key={index} className="activity-item">
                  {activity}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Sessions Container with List */}
        {sessions.length > 0 ? (
          <section className="sessions-container">
            {/* Left Column: Sessions List */}
            <div className="sessions-list-column">
              <div className="sessions-list-header">
                <h2>📋 Sessions</h2>
              </div>
              <div className="sessions-list-container">
                {sessions.map((session) => {
                  const counts = sessionGraphCounts.get(session.sessionId) || { nodes: 0, edges: 0 };
                  const createdAt = session.createdAt 
                    ? (typeof session.createdAt === 'string' ? new Date(session.createdAt) : session.createdAt)
                    : null;
                  const formattedDate = createdAt 
                    ? createdAt.toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Unknown';
                  
                  return (
                    <div
                      key={session.sessionId}
                      className={`session-list-item ${currentSession === session.sessionId ? 'active' : ''}`}
                      onClick={() => {
                        setCurrentSession(session.sessionId);
                      }}
                    >
                      <div className="session-list-item-main">
                        <div className="session-list-item-header">
                          <div className="session-list-item-title">
                            <span className="session-list-item-id">Session {sessions.indexOf(session) + 1}</span>
                            <span className={`session-list-item-status status-${session.status}`}>{session.status}</span>
                          </div>
                          {session.status === 'running' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStopSession(session.sessionId);
                              }}
                              className="session-list-item-stop"
                              title="Stop session"
                            >
                              ⏹️
                            </button>
                          )}
                        </div>
                        <div className="session-list-item-info">
                          <div className="session-list-item-meta">
                            <span className="session-list-item-timestamp">🕒 {formattedDate}</span>
                            {session.url && (
                              <span className="session-list-item-url" title={session.url}>
                                🌐 {session.url.length > 30 ? `${session.url.substring(0, 30)}...` : session.url}
                              </span>
                            )}
                          </div>
                          <div className="session-list-item-stats">
                            <span className="session-list-item-stat">
                              <strong>{counts.nodes}</strong> nodes
                            </span>
                            <span className="session-list-item-stat">
                              <strong>{counts.edges}</strong> edges
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Session Content - Exploration Visualization and User Stories */}
            <div className="sessions-content-column">
              {currentSession ? (
                <div className="session-content">
                {/* Visualization Panel */}
                <section className="visualization-panel">
                  <h2>🗺️ Exploration Visualization</h2>
                  <div className="narrative-box">
                    <p><strong>Visualization:</strong> Interactive mapping of exploration paths, interaction flows, and state transitions discovered by the agent.</p>
                  </div>
                  {graphData ? (
                    <>
                      <div className="graph-stats">
                        <div className="stat-item">
                          <strong>{graphData.nodes.length}</strong> States
                        </div>
                        <div className="stat-item">
                          <strong>{graphData.edges.length}</strong> Transitions
                        </div>
                      </div>
                      <div className="edge-legend" style={{
                        marginTop: '0.75rem',
                        marginBottom: '0.75rem',
                        padding: '0.75rem',
                        background: '#f8f9fa',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        alignItems: 'center',
                      }}>
                        <span style={{ fontWeight: 600, color: '#555', marginRight: '0.5rem' }}>Edge Types:</span>
                        {Object.entries(ACTION_TYPE_CONFIGS).map(([key, config]) => (
                          <div key={key} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                          }}>
                            <svg width="24" height="4" style={{ overflow: 'visible' }}>
                              <line
                                x1="0"
                                y1="2"
                                x2="24"
                                y2="2"
                                stroke={config.color}
                                strokeWidth="3"
                                strokeDasharray={config.strokeDasharray || '0'}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span style={{ color: '#666' }}>
                              {config.icon} {key.charAt(0).toUpperCase() + key.slice(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {flowNodes.length > 0 ? (
                    <div className="flow-container">
                      <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                        Showing graph for: <strong>{currentSession.substring(0, 30)}...</strong>
                      </div>
                      <ReactFlow
                        nodes={flowNodes}
                        edges={flowEdges}
                        edgeTypes={edgeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
                        attributionPosition="bottom-left"
                        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
                      >
                        <Background gap={20} size={1} />
                        <Controls />
                        <MiniMap 
                          nodeColor={(node) => {
                            const hasSelfLoop = flowEdges.some(e => e.source === node.id && e.target === node.id);
                            return hasSelfLoop ? '#f59e0b' : '#667eea';
                          }}
                          maskColor="rgba(0, 0, 0, 0.1)"
                        />
                      </ReactFlow>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <p>No visualization data available for this session.</p>
                      <p>The session may still be running or hasn't generated any graph data yet.</p>
                    </div>
                  )}
                </section>

                {/* User Stories Panel */}
                <section className="user-stories-panel">
                  <h2>📖 User Stories</h2>
                  <div className="narrative-box">
                    <p><strong>User Stories:</strong> AI-generated user stories compiled from the exploration data, describing complete workflows and user interactions.</p>
                  </div>
                  {userStories ? (
            <div className="user-stories-content">
              {userStories.summary && (
                <div className="user-stories-summary" style={{
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  background: '#f0f4ff',
                  border: '1px solid #667eea',
                  borderRadius: '8px',
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#667eea' }}>📋 Summary</h3>
                  <p style={{ margin: 0, color: '#333' }}>{userStories.summary}</p>
                </div>
              )}
                  {userStories.stories && userStories.stories.length > 0 ? (
                <div className="user-stories-list">
                  {userStories.stories.map((story, index) => (
                    <div key={index} className="user-story-card" style={{
                      marginBottom: '1.5rem',
                      padding: '1.5rem',
                      background: '#fff',
                      border: '2px solid #e0e0e0',
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'flex-start',
                        marginBottom: '0.75rem',
                      }}>
                        <h3 style={{ 
                          marginTop: 0, 
                          marginBottom: 0, 
                          color: '#333',
                          fontSize: '1.25rem',
                          flex: 1,
                        }}>
                          {index + 1}. {story.title}
                        </h3>
                        <button
                          onClick={() => handleRetryStory(index)}
                          className="btn-retry"
                          disabled={!!currentRetry && currentRetry.status === 'running'}
                          title="Retry this user story"
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#667eea',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s',
                            marginLeft: '1rem',
                          }}
                        >
                          🔄 Retry
                        </button>
                      </div>
                      {story.description && (
                        <p style={{ 
                          marginBottom: '1rem', 
                          color: '#666',
                          fontSize: '0.95rem',
                          lineHeight: '1.6',
                        }}>
                          {story.description}
                        </p>
                      )}
                      {story.steps && story.steps.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <h4 style={{ 
                            marginBottom: '0.5rem', 
                            color: '#555',
                            fontSize: '1rem',
                            fontWeight: '600',
                          }}>
                            Steps:
                          </h4>
                          <ol style={{ 
                            margin: 0, 
                            paddingLeft: '1.5rem',
                            color: '#444',
                          }}>
                            {story.steps.map((step, stepIndex) => (
                              <li key={stepIndex} style={{ marginBottom: '0.5rem', lineHeight: '1.5' }}>
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {story.flow && story.flow.length > 0 && (
                        <div>
                          <h4 style={{ 
                            marginBottom: '0.5rem', 
                            color: '#555',
                            fontSize: '1rem',
                            fontWeight: '600',
                          }}>
                            Flow:
                          </h4>
                          <div style={{
                            background: '#f9f9f9',
                            padding: '0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                          }}>
                            {story.flow.map((flowItem, flowIndex) => (
                              <div key={flowIndex} style={{ 
                                marginBottom: '0.5rem',
                                padding: '0.5rem',
                                background: '#fff',
                                borderRadius: '4px',
                                border: '1px solid #e0e0e0',
                              }}>
                                <span style={{ color: '#667eea', fontWeight: '600' }}>
                                  {flowItem.from}
                                </span>
                                {' → '}
                                <span style={{ color: '#f59e0b', fontWeight: '600' }}>
                                  {flowItem.action}
                                </span>
                                {' → '}
                                <span style={{ color: '#667eea', fontWeight: '600' }}>
                                  {flowItem.to}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>No user stories generated yet.</p>
                  <p>User stories are generated automatically when a session completes.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <p>No user stories available for this session.</p>
                    <p>User stories are generated automatically when the exploration completes. If the session is still running, wait for it to complete.</p>
                  </div>
                  )}
                </section>
              </div>
              ) : (
                <div className="session-empty-state">
                  <div className="session-empty-state-content">
                    <div className="session-empty-state-icon">📋</div>
                    <h3>Select a Session</h3>
                    <p>Choose a session from the list on the left to view its exploration visualization and user stories.</p>
                    <div className="session-empty-state-features">
                      <div className="session-empty-state-feature">
                        <span className="feature-icon">🗺️</span>
                        <span>Exploration Visualization</span>
                      </div>
                      <div className="session-empty-state-feature">
                        <span className="feature-icon">📖</span>
                        <span>User Stories</span>
                      </div>
                      <div className="session-empty-state-feature">
                        <span className="feature-icon">📊</span>
                        <span>Graph Statistics</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="sessions-container" style={{ gridTemplateColumns: '1fr' }}>
            <div className="session-empty-state">
              <p>No sessions available. Start an exploration to create a session.</p>
            </div>
          </section>
        )}
      </main>

      {/* Retry Progress Panel */}
      {currentRetry && (
        <RetryProgressPanel
          currentRetry={currentRetry}
          onClose={() => setCurrentRetry(null)}
        />
      )}
    </div>
  );
}

export default App;
