import { ActionTypeConfig } from './types';

export const ACTION_TYPE_CONFIGS: Record<string, ActionTypeConfig> = {
  click: {
    color: '#3b82f6', // Blue
    strokeWidth: 2.5,
    icon: '👆',
    labelColor: '#1e40af',
  },
  type: {
    color: '#10b981', // Green
    strokeWidth: 2.5,
    icon: '⌨️',
    labelColor: '#065f46',
  },
  select: {
    color: '#8b5cf6', // Purple
    strokeWidth: 2.5,
    icon: '📋',
    labelColor: '#5b21b6',
  },
  navigate: {
    color: '#f59e0b', // Amber
    strokeWidth: 2.5,
    strokeDasharray: '8,4',
    icon: '🧭',
    labelColor: '#92400e',
  },
  action: {
    color: '#667eea', // Default purple
    strokeWidth: 2,
    icon: '⚡',
    labelColor: '#4c1d95',
  },
};

