import { Session, SessionGraphCounts } from '../types';
import { formatTokens } from '../utils';

interface SessionsListProps {
  sessions: Session[];
  currentSession: string | null;
  sessionGraphCounts: Map<string, SessionGraphCounts>;
  onSessionSelect: (sessionId: string) => void;
  onStopSession: (sessionId: string) => void;
}

export default function SessionsList({
  sessions,
  currentSession,
  sessionGraphCounts,
  onSessionSelect,
  onStopSession,
}: SessionsListProps) {
  return (
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
                onSessionSelect(session.sessionId);
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
                        onStopSession(session.sessionId);
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
                    {session.tokenUsage && (
                      <span className="session-list-item-stat" title="Token usage">
                        [{formatTokens(session.tokenUsage.total.inputTokens)} / {formatTokens(session.tokenUsage.total.outputTokens)}] tokens
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

