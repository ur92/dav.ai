import { UserStoriesResult, RetrySession } from '../types';

interface UserStoriesPanelProps {
  userStories: UserStoriesResult | null;
  currentRetry: RetrySession | null;
  onRetryStory: (storyIndex: number) => void;
}

export default function UserStoriesPanel({
  userStories,
  currentRetry,
  onRetryStory,
}: UserStoriesPanelProps) {
  return (
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
                      onClick={() => onRetryStory(index)}
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
  );
}

