import { useState, useEffect, useCallback } from 'react';
import './App.css';
import RetryProgressPanel from './RetryProgressPanel';
import { Session, GraphData, UserStoriesResult, RetrySession, ActivityLog } from './types';
import { useApi } from './hooks/useApi';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessionPolling } from './hooks/useSessionPolling';
import { useGraphData } from './hooks/useGraphData';
import ControlPanel from './components/ControlPanel';
import ActivityPanel from './components/ActivityPanel';
import SessionsList from './components/SessionsList';
import VisualizationPanel from './components/VisualizationPanel';
import UserStoriesPanel from './components/UserStoriesPanel';

function App() {
  const [url, setUrl] = useState('http://localhost:5173/');
  const [appUsername, setAppUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [agentActivity, setAgentActivity] = useState<ActivityLog[]>([]);
  const [userStories, setUserStories] = useState<UserStoriesResult | null>(null);
  const [currentRetry, setCurrentRetry] = useState<RetrySession | null>(null);

  const {
    sessions,
    sessionGraphCounts,
    loadSessions,
    loadGraph,
    loadUserStories,
    loadConfig,
    loadCredentials,
    startExploration,
    stopSession,
    startRetry,
    pollRetryStatus,
    getSession,
  } = useApi();

  const { flowNodes, flowEdges } = useGraphData(graphData);

  const addActivity = useCallback((message: ActivityLog) => {
    setAgentActivity((prev) => {
      const newActivity = [...prev, message];
      // Keep only last 50 activities
      return newActivity.slice(-50);
    });
  }, []);

  const handleExplorationComplete = useCallback(() => {
    setLoading(false);
    loadSessions(); // Refresh sessions list (now includes graph counts)
    if (currentSession) {
      // Load graph for the current session
      loadGraph(currentSession).then((data) => {
        if (data) {
          setGraphData(data);
        }
      });
    }
  }, [currentSession, loadSessions, loadGraph, setGraphData]);

  const handleRetryStepUpdate = useCallback((retryId: string, step: any) => {
    if (currentRetry && currentRetry.retryId === retryId) {
      setCurrentRetry((prev) => {
        if (!prev) return null;
        const updatedSteps = [...prev.steps];
        const stepIndex = updatedSteps.findIndex((s) => s.index === step.index);
        if (stepIndex >= 0) {
          updatedSteps[stepIndex] = step;
        }
        return { ...prev, steps: updatedSteps };
      });
    }
  }, [currentRetry]);

  useWebSocket(handleExplorationComplete, handleRetryStepUpdate, addActivity);

  const handleLoadGraph = useCallback(async (sessionId: string) => {
    const data = await loadGraph(sessionId);
    if (data) {
      setGraphData(data);
    }
    return data;
  }, [loadGraph, setGraphData]);

  useSessionPolling({
    currentSession,
    loadGraph: handleLoadGraph,
    loadUserStories,
    getSession,
    loadSessions,
    setGraphData,
    setUserStories,
    setLoading,
    addActivity,
  });

  useEffect(() => {
    // Load configuration from API
    const loadInitialConfig = async () => {
      const config = await loadConfig();
      if (config) {
        if (config.startingUrl) {
          setUrl(config.startingUrl);
        }
      }
    };

    // Load credentials from API
    const loadInitialCredentials = async () => {
      const credentials = await loadCredentials();
      if (credentials) {
        if (credentials.username) {
          setAppUsername(credentials.username);
        }
        if (credentials.password) {
          setAppPassword(credentials.password);
        }
      }
    };

    loadInitialConfig();
    loadInitialCredentials();
    loadSessions(); // Load sessions (graph counts are now included in the API response)
  }, [loadConfig, loadCredentials, loadSessions]);

  // Auto-select first session when sessions are loaded and no session is selected
  useEffect(() => {
    if (sessions.length > 0 && currentSession === null) {
      setCurrentSession(sessions[0].sessionId);
    }
  }, [sessions, currentSession]);

  // Graph counts are now included in the sessions API response, so no need for lazy loading

  const handleStartExploration = async () => {
    if (!url) {
      alert('Please enter a URL');
      return;
    }

    setLoading(true);
    setAgentActivity([]);
    addActivity('🚀 Starting agentic web operator...');
    
    try {
      const data = await startExploration(
        url,
        appUsername || appPassword ? {
          username: appUsername,
          password: appPassword,
        } : undefined
      );

      if (data.sessionId) {
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
    const success = await stopSession(sessionId);
    if (success) {
      addActivity(`⏹️ Session stopped: ${sessionId}`);
      loadSessions(); // Refresh sessions list (includes graph counts)
      if (currentSession === sessionId) {
        setCurrentSession(null);
        setLoading(false);
      }
    }
  };

  const handleRetryStory = async (storyIndex: number) => {
    if (!currentSession) {
      alert('No session selected');
      return;
    }

    try {
      const data = await startRetry(
        currentSession,
        storyIndex,
        appUsername || appPassword ? {
          username: appUsername,
          password: appPassword,
        } : undefined
      );

      addActivity(`🔄 Retry started for story ${storyIndex + 1}`);
      
      // Poll for retry status
      const pollRetry = async (retryId: string) => {
        const retrySession = await pollRetryStatus(retryId);
        if (retrySession) {
          setCurrentRetry(retrySession);
          
          // Continue polling if retry is still running
          if (retrySession.status === 'running' || retrySession.status === 'pending') {
            setTimeout(() => pollRetry(retryId), 500);
          } else {
            addActivity(`✅ Retry ${retrySession.status} for story ${retrySession.storyIndex + 1}`);
          }
        }
      };
      
      pollRetry(data.retryId);
    } catch (error) {
      console.error('Error starting retry:', error);
      alert(`Failed to start retry: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        <ControlPanel
          url={url}
          setUrl={setUrl}
          appUsername={appUsername}
          setAppUsername={setAppUsername}
          appPassword={appPassword}
          setAppPassword={setAppPassword}
          loading={loading}
          activeSession={activeSession}
          onStartExploration={handleStartExploration}
          onStopSession={handleStopSession}
        />

        <ActivityPanel agentActivity={agentActivity} />

        {sessions.length > 0 ? (
          <section className="sessions-container">
            <SessionsList
              sessions={sessions}
              currentSession={currentSession}
              sessionGraphCounts={sessionGraphCounts}
              onSessionSelect={setCurrentSession}
              onStopSession={handleStopSession}
            />

            <div className="sessions-content-column">
              {currentSession ? (
                <div className="session-content">
                  <VisualizationPanel
                    graphData={graphData}
                    flowNodes={flowNodes}
                    flowEdges={flowEdges}
                    currentSession={currentSession}
                  />

                  <UserStoriesPanel
                    userStories={userStories}
                    currentRetry={currentRetry}
                    onRetryStory={handleRetryStory}
                  />
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
