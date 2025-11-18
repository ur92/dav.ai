import { useState, useCallback } from 'react';
import { Session, SessionGraphCounts, GraphData, UserStoriesResult } from '../types';

export function useApi() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionGraphCounts, setSessionGraphCounts] = useState<Map<string, SessionGraphCounts>>(new Map());

  const loadGraphCounts = useCallback(async (sessionId: string): Promise<SessionGraphCounts> => {
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
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/sessions');
      const data = await response.json();
      const sessionsList: Session[] = data.sessions;
      setSessions(sessionsList);
      
      // Extract graph counts from sessions (now included in API response)
      const countsMap = new Map<string, SessionGraphCounts>();
      sessionsList.forEach((session) => {
        if (session.graphCounts) {
          countsMap.set(session.sessionId, session.graphCounts);
        }
      });
      setSessionGraphCounts(countsMap);
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }, []);

  const loadGraph = useCallback(async (sessionId: string): Promise<GraphData | null> => {
    if (!sessionId) {
      console.warn('loadGraph called without sessionId');
      return null;
    }
    try {
      const url = `http://localhost:3001/api/graph?limit=200&sessionId=${encodeURIComponent(sessionId)}`;
      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error loading graph:', error);
      return null;
    }
  }, []);

  const loadUserStories = useCallback(async (sessionId: string): Promise<UserStoriesResult | null> => {
    try {
      const response = await fetch(`http://localhost:3001/api/session/${sessionId}`);
      if (response.ok) {
        const session: Session = await response.json();
        return session.userStories || null;
      }
    } catch (error) {
      console.error('Error loading user stories:', error);
    }
    return null;
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/config');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
    return null;
  }, []);

  const loadCredentials = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/credentials');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error loading credentials:', error);
    }
    return null;
  }, []);

  const startExploration = useCallback(async (
    url: string,
    maxIterations?: number,
    credentials?: { username: string; password: string }
  ) => {
    try {
      const response = await fetch('http://localhost:3001/api/explore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          maxIterations: maxIterations || undefined,
          credentials: credentials || undefined,
        }),
      });
      return await response.json();
    } catch (error) {
      console.error('Error starting exploration:', error);
      throw error;
    }
  }, []);

  const stopSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/session/${sessionId}/stop`, {
        method: 'POST',
      });
      return response.ok;
    } catch (error) {
      console.error('Error stopping session:', error);
      return false;
    }
  }, []);

  const startRetry = useCallback(async (
    sessionId: string,
    storyIndex: number,
    credentials?: { username: string; password: string }
  ) => {
    try {
      const response = await fetch('http://localhost:3001/api/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          storyIndex,
          credentials: credentials || undefined,
        }),
      });
      if (response.ok) {
        return await response.json();
      } else {
        const error = await response.json();
        throw new Error(error.message || error.error);
      }
    } catch (error) {
      console.error('Error starting retry:', error);
      throw error;
    }
  }, []);

  const pollRetryStatus = useCallback(async (retryId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/retry/${retryId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error polling retry status:', error);
    }
    return null;
  }, []);

  const getSession = useCallback(async (sessionId: string): Promise<Session | null> => {
    try {
      const response = await fetch(`http://localhost:3001/api/session/${sessionId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
    return null;
  }, []);

  return {
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
  };
}

