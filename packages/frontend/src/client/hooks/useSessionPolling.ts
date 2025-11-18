import { useEffect, useRef } from 'react';
import { Session, UserStoriesResult, ActivityLog } from '../types';

interface UseSessionPollingOptions {
  currentSession: string | null;
  loadGraph: (sessionId: string) => Promise<any>;
  loadUserStories: (sessionId: string) => Promise<UserStoriesResult | null>;
  getSession: (sessionId: string) => Promise<Session | null>;
  loadSessions: () => Promise<void>;
  setGraphData: (data: any) => void;
  setUserStories: (stories: UserStoriesResult | null) => void;
  setLoading: (loading: boolean) => void;
  addActivity: (message: ActivityLog) => void;
}

export function useSessionPolling({
  currentSession,
  loadGraph,
  loadUserStories,
  getSession,
  loadSessions,
  setGraphData,
  setUserStories,
  setLoading,
  addActivity,
}: UseSessionPollingOptions) {
  // Use refs to store the latest function references without causing re-renders
  const loadGraphRef = useRef(loadGraph);
  const loadUserStoriesRef = useRef(loadUserStories);
  const getSessionRef = useRef(getSession);
  const loadSessionsRef = useRef(loadSessions);
  const setGraphDataRef = useRef(setGraphData);
  const setUserStoriesRef = useRef(setUserStories);
  const setLoadingRef = useRef(setLoading);
  const addActivityRef = useRef(addActivity);

  // Update refs when functions change
  useEffect(() => {
    loadGraphRef.current = loadGraph;
    loadUserStoriesRef.current = loadUserStories;
    getSessionRef.current = getSession;
    loadSessionsRef.current = loadSessions;
    setGraphDataRef.current = setGraphData;
    setUserStoriesRef.current = setUserStories;
    setLoadingRef.current = setLoading;
    addActivityRef.current = addActivity;
  }, [loadGraph, loadUserStories, getSession, loadSessions, setGraphData, setUserStories, setLoading, addActivity]);

  useEffect(() => {
    if (!currentSession) {
      // Clear graph when no session is selected
      setGraphDataRef.current(null);
      setUserStoriesRef.current(null);
      return;
    }

    // Clear old graph data when switching sessions to prevent showing stale data
    setGraphDataRef.current(null);
    
    // Load graph for the selected session immediately
    loadGraphRef.current(currentSession);
    
    // Load user stories immediately when switching sessions
    loadUserStoriesRef.current(currentSession).then((stories) => {
      if (stories) {
        setUserStoriesRef.current(stories);
      }
    });

    let lastDecisionCount = 0;
    let sessionStatus: string | null = null;
    let intervalId: NodeJS.Timeout | null = null;
    let isCompleted = false;
    let lastLoadSessionsTime = 0;
    let lastLoadGraphTime = 0;
    const LOAD_SESSIONS_INTERVAL = 5000; // Only reload sessions list every 5 seconds
    const LOAD_GRAPH_INTERVAL = 2000; // Only reload graph every 2 seconds for running sessions

    const pollSession = async () => {
      try {
        const session = await getSessionRef.current(currentSession);
        if (!session) return;

        const previousStatus = sessionStatus;
        sessionStatus = session.status;
        
        // Check if session just completed
        const justCompleted = (previousStatus === 'running' || previousStatus === null) && 
                             (session.status === 'completed' || session.status === 'error');
        
        // Update activity feed with new logs (CORE logs)
        if (session.logs && Array.isArray(session.logs)) {
          const newLogs = session.logs.slice(lastDecisionCount);
          newLogs.forEach((log) => {
            addActivityRef.current({
              timestamp: log.timestamp,
              level: log.level,
              context: log.context,
              message: log.message,
              data: log.data,
            });
          });
          lastDecisionCount = session.logs.length;
        }

        // Update user stories if available (always check, not just when completed)
        if (session.userStories) {
          setUserStoriesRef.current(session.userStories);
        }

        // Only reload sessions list periodically or when status changes (not every poll)
        const now = Date.now();
        if (justCompleted || (now - lastLoadSessionsTime > LOAD_SESSIONS_INTERVAL)) {
          loadSessionsRef.current(); // Load sessions (graph counts are now included in API)
          lastLoadSessionsTime = now;
        }
        
        // Reload graph periodically for this session (but less frequently)
        if (session.status === 'running') {
          // Only reload graph every 2 seconds for running sessions
          if (now - lastLoadGraphTime > LOAD_GRAPH_INTERVAL) {
            loadGraphRef.current(currentSession).then((graphData) => {
              if (graphData) {
                setGraphDataRef.current(graphData);
              }
            });
            lastLoadGraphTime = now;
          }
        }

        // Handle completed/error sessions
        if (session.status === 'completed' || session.status === 'error') {
          setLoadingRef.current(false);
          // Only load graph once when session completes
          if (justCompleted) {
            loadGraphRef.current(currentSession).then((graphData) => {
              if (graphData) {
                setGraphDataRef.current(graphData);
              }
            });
          }
          // Add final logs if any
          if (session.logs && session.logs.length > lastDecisionCount) {
            session.logs.slice(lastDecisionCount).forEach((log) => {
              addActivityRef.current({
                timestamp: log.timestamp,
                level: log.level,
                context: log.context,
                message: log.message,
                data: log.data,
              });
            });
          }
          // Ensure user stories are loaded when completed
          if (session.userStories) {
            setUserStoriesRef.current(session.userStories);
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
  }, [currentSession]); // Only depend on currentSession, use refs for functions
}

