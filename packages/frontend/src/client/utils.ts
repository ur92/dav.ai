import { ActionTypeConfig } from './types';
import { ACTION_TYPE_CONFIGS } from './constants';

/**
 * Format a number in thousands with "k" notation
 * Examples: 14000 -> "14k", 500 -> "0.5k", 1500 -> "1.5k", 1000 -> "1k"
 */
export function formatTokens(num: number): string {
  if (num === 0) return '0';
  if (num < 1000) {
    // For numbers less than 1000, show as decimal k (e.g., 500 -> 0.5k)
    return `${(num / 1000).toFixed(1)}k`;
  }
  // For numbers >= 1000, show whole k with one decimal if needed
  const thousands = num / 1000;
  if (thousands % 1 === 0) {
    return `${thousands}k`;
  }
  return `${thousands.toFixed(1)}k`;
}

export function getActionTypeConfig(label: string): ActionTypeConfig {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('click')) return ACTION_TYPE_CONFIGS.click;
  if (lowerLabel.includes('type')) return ACTION_TYPE_CONFIGS.type;
  if (lowerLabel.includes('select')) return ACTION_TYPE_CONFIGS.select;
  if (lowerLabel.includes('navigate')) return ACTION_TYPE_CONFIGS.navigate;
  return ACTION_TYPE_CONFIGS.action;
}

export function getStageInfo(context: string) {
  const upperContext = context.toUpperCase();
  if (upperContext.includes('OBSERVE')) {
    return { icon: '👁️', color: '#3b82f6', name: 'OBSERVE' };
  } else if (upperContext.includes('EXECUTE')) {
    return { icon: '⚡', color: '#10b981', name: 'EXECUTE' };
  } else if (upperContext.includes('DECIDE')) {
    return { icon: '🤖', color: '#8b5cf6', name: 'DECIDE' };
  } else if (upperContext.includes('PERSIST')) {
    return { icon: '💾', color: '#f59e0b', name: 'PERSIST' };
  } else if (upperContext.includes('AGENT')) {
    return { icon: '🤖', color: '#667eea', name: 'AGENT' };
  } else if (upperContext.includes('SERVER')) {
    return { icon: '🖥️', color: '#6b7280', name: 'SERVER' };
  }
  return { icon: '📝', color: '#9ca3af', name: context };
}

