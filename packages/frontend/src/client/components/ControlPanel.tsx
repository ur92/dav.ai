import { Session } from '../types';

interface ControlPanelProps {
  url: string;
  setUrl: (url: string) => void;
  maxIterations: number | undefined;
  setMaxIterations: (iterations: number | undefined) => void;
  appUsername: string;
  setAppUsername: (username: string) => void;
  appPassword: string;
  setAppPassword: (password: string) => void;
  loading: boolean;
  activeSession: Session | undefined;
  onStartExploration: () => void;
  onStopSession: (sessionId: string) => void;
}

export default function ControlPanel({
  url,
  setUrl,
  maxIterations,
  setMaxIterations,
  appUsername,
  setAppUsername,
  appPassword,
  setAppPassword,
  loading,
  activeSession,
  onStartExploration,
  onStopSession,
}: ControlPanelProps) {
  return (
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
      {activeSession && activeSession.status === 'running' ? (
        <button
          onClick={() => onStopSession(activeSession.sessionId)}
          className="btn-primary"
          style={{ background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)' }}
        >
          ⏹️ Stop Agent
        </button>
      ) : (
        <button
          onClick={onStartExploration}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? '🔄 Agent Operating...' : '🚀 Deploy Agent'}
        </button>
      )}
    </section>
  );
}

