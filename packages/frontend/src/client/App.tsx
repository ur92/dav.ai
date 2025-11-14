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
import 'reactflow/dist/style.css';
import './App.css';

// Custom edge component for self-loops
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
  // Create a curved path for self-loops with offset for multiple loops
  const offset = (data as any)?.offset || 0;
  const radius = 50 + offset;
  
  const [edgePath, labelX, labelY] = useMemo(() => {
    // Create a semi-circular loop above the node
    const controlPointY = sourceY - radius;
    const endX = sourceX;
    const endY = sourceY;
    
    // Use quadratic bezier for smooth loop
    const path = `M ${sourceX} ${sourceY} 
                  Q ${sourceX + radius * 0.5} ${sourceY - radius * 0.3} ${sourceX} ${controlPointY}
                  Q ${sourceX - radius * 0.5} ${sourceY - radius * 0.3} ${endX} ${endY}`;
    
    return [path, sourceX, controlPointY - 10];
  }, [sourceX, sourceY, radius]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
      />
      {label && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          style={labelStyle}
          className="react-flow__edge-text"
        >
          {label}
        </text>
      )}
    </>
  );
}

const edgeTypes: EdgeTypes = {
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
  currentState?: {
    currentUrl?: string;
    actionHistory?: string[];
    explorationStatus?: string;
  };
  decisions?: string[]; // Agent decisions for display
  userStories?: UserStoriesResult; // Compiled user stories
}

interface GraphData {
  nodes: Array<{ id: string; label: string; url: string }>;
  edges: Array<{ source: string; target: string; label: string }>;
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

  // Convert graph data to ReactFlow format with hierarchical layout
  useEffect(() => {
    if (graphData && graphData.nodes.length > 0) {
      const nodePositions = new Map<string, { x: number; y: number }>();
      
      // Build adjacency lists for topological sorting
      const inDegree = new Map<string, number>();
      const outEdges = new Map<string, string[]>();
      
      // Initialize all nodes
      graphData.nodes.forEach(node => {
        inDegree.set(node.id, 0);
        outEdges.set(node.id, []);
      });
      
      // Build graph structure
      graphData.edges.forEach(edge => {
        if (edge.source !== edge.target) { // Skip self-loops for layout
          const currentIn = inDegree.get(edge.target) || 0;
          inDegree.set(edge.target, currentIn + 1);
          
          const currentOut = outEdges.get(edge.source) || [];
          currentOut.push(edge.target);
          outEdges.set(edge.source, currentOut);
        }
      });
      
      // Topological sort for hierarchical layout
      const layers: string[][] = [];
      const processed = new Set<string>();
      const nodeWidth = 280;
      const nodeHeight = 140;
      const spacingX = nodeWidth + 80;
      const spacingY = nodeHeight + 60;
      
      // Find root nodes (nodes with no incoming edges)
      let currentLayer: string[] = [];
      inDegree.forEach((degree, nodeId) => {
        if (degree === 0) {
          currentLayer.push(nodeId);
        }
      });
      
      // If no root nodes (circular graph), start with first node
      if (currentLayer.length === 0 && graphData.nodes.length > 0) {
        currentLayer = [graphData.nodes[0].id];
      }
      
      // Build layers using BFS-like approach
      while (currentLayer.length > 0) {
        layers.push([...currentLayer]);
        currentLayer.forEach(nodeId => processed.add(nodeId));
        
        const nextLayer: string[] = [];
        currentLayer.forEach(nodeId => {
          const children = outEdges.get(nodeId) || [];
          children.forEach(childId => {
            if (!processed.has(childId)) {
              const remainingIn = (inDegree.get(childId) || 0) - 1;
              inDegree.set(childId, remainingIn);
              if (remainingIn === 0 && !nextLayer.includes(childId)) {
                nextLayer.push(childId);
              }
            }
          });
        });
        
        currentLayer = nextLayer;
      }
      
      // Add any remaining nodes (for circular dependencies)
      graphData.nodes.forEach(node => {
        if (!processed.has(node.id)) {
          if (layers.length === 0) {
            layers.push([]);
          }
          layers[layers.length - 1].push(node.id);
        }
      });
      
      // Position nodes in layers
      layers.forEach((layer, layerIndex) => {
        const layerWidth = layer.length * spacingX;
        const startX = Math.max(100, (1400 - layerWidth) / 2); // Center the layer
        
        layer.forEach((nodeId, nodeIndex) => {
          nodePositions.set(nodeId, {
            x: startX + nodeIndex * spacingX,
            y: 100 + layerIndex * spacingY,
          });
        });
      });

      // Count connections per node to identify hubs
      const connectionCounts = new Map<string, number>();
      graphData.edges.forEach((edge) => {
        connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
        connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
      });

      const nodes: Node[] = graphData.nodes.map((node) => {
        const position = nodePositions.get(node.id) || { x: 100, y: 100 };
        const connections = connectionCounts.get(node.id) || 0;
        const isSelfLoop = graphData.edges.some(e => e.source === node.id && e.target === node.id);
        
        return {
          id: node.id,
          type: 'default',
          data: {
            label: (
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', wordBreak: 'break-word' }}>
                  {node.url.length > 50 ? `${node.url.substring(0, 50)}...` : node.url}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#666' }}>
                  {connections} connection{connections !== 1 ? 's' : ''}
                  {isSelfLoop && ' • Self-loops'}
                </div>
              </div>
            ),
          },
          position,
          style: {
            background: '#fff',
            border: isSelfLoop ? '3px solid #f59e0b' : '2px solid #667eea',
            borderRadius: '8px',
            padding: '10px',
            minWidth: '220px',
            maxWidth: '280px',
          },
        };
      });

      // Create edges with better handling of self-loops
      // Group self-loops and limit display to avoid visual clutter
      const selfLoopsByNode = new Map<string, Array<{ edge: GraphData['edges'][0]; index: number }>>();
      const regularEdges: Array<{ edge: GraphData['edges'][0]; index: number }> = [];
      
      graphData.edges.forEach((edge, index) => {
        if (edge.source === edge.target) {
          if (!selfLoopsByNode.has(edge.source)) {
            selfLoopsByNode.set(edge.source, []);
          }
          selfLoopsByNode.get(edge.source)!.push({ edge, index });
        } else {
          regularEdges.push({ edge, index });
        }
      });

      const edges: Edge[] = [];
      
      // Add regular edges (non-self-loops)
      regularEdges.forEach(({ edge, index }) => {
        const label = edge.label || 'action';
        const shortLabel = label.length > 30 ? `${label.substring(0, 30)}...` : label;
        
        edges.push({
          id: `e${edge.source}-${edge.target}-${index}`,
          source: edge.source,
          target: edge.target,
          label: shortLabel,
          type: 'smoothstep',
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#667eea',
          },
          style: {
            stroke: '#667eea',
            strokeWidth: 2,
          },
          labelStyle: {
            fill: '#667eea',
            fontWeight: 600,
            fontSize: '11px',
            background: 'rgba(255, 255, 255, 0.8)',
            padding: '2px 6px',
            borderRadius: '4px',
          },
        });
      });

      // Add self-loops (limit to first 10 per node to avoid clutter)
      selfLoopsByNode.forEach((loops, nodeId) => {
        const displayLoops = loops.slice(0, 10); // Show max 10 self-loops per node
        const remainingCount = loops.length - displayLoops.length;
        
        displayLoops.forEach(({ edge, index }, loopIndex) => {
          const label = edge.label || 'action';
          const shortLabel = label.length > 25 ? `${label.substring(0, 25)}...` : label;
          
          edges.push({
            id: `e${nodeId}-self-${loopIndex}`,
            source: nodeId,
            target: nodeId,
            label: loopIndex === displayLoops.length - 1 && remainingCount > 0 
              ? `+${remainingCount} more...` 
              : shortLabel,
            type: 'selfloop',
            animated: false,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#f59e0b',
            },
            style: {
              stroke: '#f59e0b',
              strokeWidth: 1.5,
              strokeDasharray: '5,5',
            },
            labelStyle: {
              fill: '#f59e0b',
              fontWeight: 600,
              fontSize: '10px',
              background: 'rgba(255, 255, 255, 0.9)',
              padding: '2px 6px',
              borderRadius: '4px',
            },
            data: {
              offset: loopIndex * 15, // Offset multiple self-loops
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

          // Poll current session for real-time updates
          useEffect(() => {
            if (!currentSession) {
              // Clear graph when no session is selected
              setGraphData(null);
              return;
            }

            // Load graph for the selected session immediately
            loadGraph(currentSession);
            // Clear user stories when switching sessions
            setUserStories(null);

            let lastDecisionCount = 0;

            const interval = setInterval(async () => {
              try {
                const response = await fetch(`http://localhost:3001/api/session/${currentSession}`);
                if (response.ok) {
                  const session: Session = await response.json();
                  
                  // Update activity feed with new decisions (agent decisions)
                  if (session.decisions && Array.isArray(session.decisions)) {
                    const newDecisions = session.decisions.slice(lastDecisionCount);
                    newDecisions.forEach((decision) => {
                      addActivity(decision);
                    });
                    lastDecisionCount = session.decisions.length;
                  }

                  // Update user stories if available
                  if (session.userStories) {
                    setUserStories(session.userStories);
                  }

                  // Update sessions list
                  loadSessions();
                  
                  // Reload graph periodically for this session
                  if (session.status === 'running') {
                    loadGraph(currentSession);
                  }

                  // Stop polling if completed
                  if (session.status === 'completed' || session.status === 'error') {
                    setLoading(false);
                    loadGraph(currentSession);
                    // Add final decisions if any
                    if (session.decisions && session.decisions.length > lastDecisionCount) {
                      session.decisions.slice(lastDecisionCount).forEach((decision) => {
                        addActivity(decision);
                      });
                    }
                    // Load user stories when completed
                    if (session.userStories) {
                      setUserStories(session.userStories);
                    }
                  }
                }
              } catch (error) {
                console.error('Error polling session:', error);
              }
            }, 2000); // Poll every 2 seconds

            return () => clearInterval(interval);
          }, [currentSession]);

  const addActivity = useCallback((message: string) => {
    setAgentActivity((prev) => {
      const newActivity = [...prev, `[${new Date().toLocaleTimeString()}] ${message}`];
      // Keep only last 50 activities
      return newActivity.slice(-50);
    });
  }, []);

  const loadSessions = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sessions');
      const data = await response.json();
      setSessions(data.sessions);
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

        {/* Sessions Tabs */}
        {sessions.length > 0 && (
          <section className="sessions-tabs-section">
            <div className="sessions-tabs">
              {sessions.map((session) => (
                <button
                  key={session.sessionId}
                  className={`session-tab ${currentSession === session.sessionId ? 'active' : ''}`}
                  onClick={async () => {
                    setCurrentSession(session.sessionId);
                    loadGraph(session.sessionId);
                    // Load user stories for this session
                    try {
                      const response = await fetch(`http://localhost:3001/api/session/${session.sessionId}`);
                      if (response.ok) {
                        const sessionData: Session = await response.json();
                        if (sessionData.userStories) {
                          setUserStories(sessionData.userStories);
                        } else {
                          setUserStories(null);
                        }
                      }
                    } catch (error) {
                      console.error('Error loading user stories:', error);
                      setUserStories(null);
                    }
                  }}
                >
                  <div className="session-tab-content">
                    <span className="session-tab-id">{session.sessionId.substring(0, 15)}...</span>
                    <span className={`session-tab-status status-${session.status}`}>{session.status}</span>
                    {session.status === 'running' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStopSession(session.sessionId);
                        }}
                        className="session-tab-stop"
                        title="Stop session"
                      >
                        ⏹️
                      </button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Visualization Panel */}
        <section className="visualization-panel">
          <h2>🗺️ Exploration Visualization</h2>
          <div className="narrative-box">
            <p><strong>Visualization:</strong> Interactive mapping of exploration paths, interaction flows, and state transitions discovered by the agent.</p>
          </div>
          <button 
            onClick={() => loadGraph(currentSession || undefined)} 
            className="btn-secondary" 
            style={{ marginBottom: '1rem' }}
            disabled={!currentSession}
          >
            🔄 Refresh Graph {currentSession ? `(Session)` : ''}
          </button>
          {!currentSession && (
            <div className="empty-state" style={{ marginBottom: '1rem', padding: '1rem', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px' }}>
              <p style={{ margin: 0, color: '#856404' }}>
                <strong>Select a session</strong> from the tabs above to view its exploration visualization.
              </p>
            </div>
          )}
          {graphData ? (
            <div className="graph-stats">
              <div className="stat-item">
                <strong>{graphData.nodes.length}</strong> States
              </div>
              <div className="stat-item">
                <strong>{graphData.edges.length}</strong> Transitions
              </div>
            </div>
          ) : null}
          {!currentSession ? (
            <div className="empty-state">
              <p>No session selected.</p>
              <p>Select a session from the tabs above to view its exploration visualization.</p>
            </div>
          ) : flowNodes.length > 0 ? (
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
          {!currentSession ? (
            <div className="empty-state">
              <p>No session selected.</p>
              <p>Select a completed session to view compiled user stories.</p>
            </div>
          ) : userStories ? (
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
                      <h3 style={{ 
                        marginTop: 0, 
                        marginBottom: '0.75rem', 
                        color: '#333',
                        fontSize: '1.25rem',
                        borderBottom: '2px solid #667eea',
                        paddingBottom: '0.5rem',
                      }}>
                        {index + 1}. {story.title}
                      </h3>
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
      </main>
    </div>
  );
}

export default App;
