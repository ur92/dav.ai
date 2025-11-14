import { useState, useEffect } from 'react';
import './App.css';

interface Session {
  sessionId: string;
  status: string;
  hasState: boolean;
}

interface GraphData {
  nodes: Array<{ id: string; label: string; url: string }>;
  edges: Array<{ source: string; target: string; label: string }>;
}

function App() {
  const [url, setUrl] = useState('https://example.com');
  const [maxIterations, setMaxIterations] = useState(20);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const websocket = new WebSocket('ws://localhost:3001/ws');
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket message:', data);

      if (data.type === 'exploration_complete' || data.type === 'exploration_error') {
        setLoading(false);
        loadSessions();
        loadGraph();
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);

    // Load initial data
    loadSessions();
    loadGraph();

    return () => {
      websocket.close();
    };
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

  const loadGraph = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/graph');
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
    try {
      const response = await fetch('http://localhost:3001/api/explore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          maxIterations,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setCurrentSession(data.sessionId);
        alert(`Exploration started! Session ID: ${data.sessionId}`);
      } else {
        alert(`Error: ${data.error || data.message}`);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error starting exploration:', error);
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
        loadSessions();
        alert('Session stopped');
      }
    } catch (error) {
      console.error('Error stopping session:', error);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🚀 DAV.ai - Discovery Analysis Validation</h1>
        <p>Agentic Web Operator for mapping user interaction flows</p>
      </header>

      <main className="app-main">
        <section className="control-panel">
          <h2>Start Exploration</h2>
          <div className="form-group">
            <label htmlFor="url">Starting URL:</label>
            <input
              id="url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="iterations">Max Iterations:</label>
            <input
              id="iterations"
              type="number"
              value={maxIterations}
              onChange={(e) => setMaxIterations(parseInt(e.target.value, 10))}
              min="1"
              max="100"
              disabled={loading}
            />
          </div>
          <button
            onClick={handleStartExploration}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Exploring...' : 'Start Exploration'}
          </button>
        </section>

        <section className="sessions-panel">
          <h2>Active Sessions</h2>
          {sessions.length === 0 ? (
            <p>No active sessions</p>
          ) : (
            <div className="sessions-list">
              {sessions.map((session) => (
                <div key={session.sessionId} className="session-item">
                  <div>
                    <strong>Session:</strong> {session.sessionId}
                    <br />
                    <strong>Status:</strong> <span className={`status-${session.status}`}>{session.status}</span>
                  </div>
                  {session.status === 'running' && (
                    <button
                      onClick={() => handleStopSession(session.sessionId)}
                      className="btn-secondary"
                    >
                      Stop
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="graph-panel">
          <h2>Exploration Graph</h2>
          <button onClick={loadGraph} className="btn-secondary">
            Refresh Graph
          </button>
          {graphData ? (
            <div className="graph-info">
              <p><strong>Nodes:</strong> {graphData.nodes.length}</p>
              <p><strong>Edges:</strong> {graphData.edges.length}</p>
              {graphData.nodes.length > 0 && (
                <div className="graph-preview">
                  <h3>States (Pages):</h3>
                  <ul>
                    {graphData.nodes.slice(0, 10).map((node) => (
                      <li key={node.id} title={node.url}>
                        {node.url.length > 60 ? `${node.url.substring(0, 60)}...` : node.url}
                      </li>
                    ))}
                    {graphData.nodes.length > 10 && (
                      <li>... and {graphData.nodes.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p>No graph data available. Start an exploration to see results.</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;

