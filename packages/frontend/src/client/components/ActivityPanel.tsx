import { useRef, useEffect } from 'react';
import { ActivityLog } from '../types';
import { getStageInfo } from '../utils';

interface ActivityPanelProps {
  agentActivity: ActivityLog[];
}

export default function ActivityPanel({ agentActivity }: ActivityPanelProps) {
  const activityFeedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new activity is added
  useEffect(() => {
    if (activityFeedRef.current) {
      activityFeedRef.current.scrollTop = activityFeedRef.current.scrollHeight;
    }
  }, [agentActivity]);

  return (
    <section className="activity-panel">
      <h2>📊 Exploration Log</h2>
      <div className="activity-feed" ref={activityFeedRef}>
        {agentActivity.length === 0 ? (
          <p className="empty-state">No activity yet. Deploy the agent to see exploration logs.</p>
        ) : (
          agentActivity.map((activity, index) => {
            // Handle legacy string format
            if (typeof activity === 'string') {
              return (
                <div key={index} className="activity-item">
                  {activity}
                </div>
              );
            }
            
            // Handle new log object format
            const stageInfo = getStageInfo(activity.context);
            const timestamp = new Date(activity.timestamp).toLocaleTimeString();
            const levelColor = activity.level === 'ERROR' ? '#ef4444' : 
                              activity.level === 'WARN' ? '#f59e0b' : 
                              '#60a5fa';
            
            return (
              <div key={index} className="activity-item" style={{ borderLeftColor: stageInfo.color }}>
                <div className="activity-item-header">
                  <span className="activity-stage" style={{ color: stageInfo.color }}>
                    {stageInfo.icon} {stageInfo.name}
                  </span>
                  <span className="activity-level" style={{ color: levelColor }}>
                    {activity.level}
                  </span>
                  <span className="activity-timestamp">{timestamp}</span>
                </div>
                <div className="activity-message">{activity.message}</div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

