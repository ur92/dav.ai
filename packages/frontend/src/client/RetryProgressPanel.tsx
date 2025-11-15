import { useEffect, useState } from 'react';
import './RetryProgressPanel.css';

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

interface RetryProgressPanelProps {
  currentRetry: RetrySession | null;
  onClose: () => void;
}

function RetryProgressPanel({ currentRetry, onClose }: RetryProgressPanelProps) {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (!currentRetry) return;

    // Update elapsed time every second
    const interval = setInterval(() => {
      const end = currentRetry.endTime || Date.now();
      setElapsed(Math.floor((end - currentRetry.startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentRetry]);

  if (!currentRetry) {
    return null;
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '▶️';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '•';
    }
  };

  const completedSteps = currentRetry.steps.filter(s => s.status === 'completed').length;
  const totalSteps = currentRetry.steps.length;
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div className="retry-progress-panel">
      <div className="retry-panel-header">
        <h3>🔄 Retry Progress</h3>
        <button className="close-btn" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="retry-panel-content">
        {/* Overall Status */}
        <div className="retry-overall-status">
          <div className="status-badge" data-status={currentRetry.status}>
            {getStatusIcon(currentRetry.status)} {currentRetry.status.toUpperCase()}
          </div>
          <div className="retry-time">
            ⏱️ {formatTime(elapsed)}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="retry-progress-bar-container">
          <div 
            className="retry-progress-bar" 
            style={{ width: `${progressPercent}%` }}
            data-status={currentRetry.status}
          />
          <div className="progress-label">
            {completedSteps} / {totalSteps} steps
          </div>
        </div>

        {/* Steps List */}
        <div className="retry-steps-list">
          {currentRetry.steps.map((step) => (
            <div 
              key={step.index} 
              className="retry-step-item" 
              data-status={step.status}
            >
              <div className="step-header">
                <span className="step-icon">{getStatusIcon(step.status)}</span>
                <span className="step-index">{step.index + 1}.</span>
                <span className="step-description">{step.description}</span>
              </div>
              {step.error && (
                <div className="step-error">
                  ⚠️ {step.error}
                </div>
              )}
              {step.status === 'running' && (
                <div className="step-spinner">
                  <div className="spinner" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        {currentRetry.status === 'completed' && (
          <div className="retry-panel-actions">
            <button className="btn-success" disabled>
              ✅ Retry Completed
            </button>
          </div>
        )}
        {currentRetry.status === 'failed' && (
          <div className="retry-panel-actions">
            <button className="btn-danger" disabled>
              ❌ Retry Failed
            </button>
          </div>
        )}
        {currentRetry.status === 'running' && (
          <div className="retry-panel-actions">
            <button className="btn-info" disabled>
              ▶️ Retry in Progress...
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RetryProgressPanel;

