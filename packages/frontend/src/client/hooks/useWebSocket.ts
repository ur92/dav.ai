import { useEffect, useState, useCallback } from 'react';
import { RetrySession } from '../types';

interface WebSocketMessage {
  type: string;
  retryId?: string;
  step?: any;
  [key: string]: any;
}

export function useWebSocket(
  onExplorationComplete: () => void,
  onRetryStepUpdate: (retryId: string, step: any) => void,
  addActivity: (message: string) => void
) {
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const websocket = new WebSocket('ws://localhost:3001/ws');
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      addActivity('🔌 Connected to agent monitoring');
    };

    websocket.onmessage = (event) => {
      const data: WebSocketMessage = JSON.parse(event.data);
      console.log('WebSocket message:', data);

      if (data.type === 'exploration_complete' || data.type === 'exploration_error') {
        addActivity(`✅ Exploration ${data.type === 'exploration_complete' ? 'completed' : 'failed'}`);
        onExplorationComplete();
      } else if (data.type === 'retry_step_update' && data.retryId && data.step) {
        onRetryStepUpdate(data.retryId, data.step);
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, [onExplorationComplete, onRetryStepUpdate, addActivity]);

  return ws;
}

