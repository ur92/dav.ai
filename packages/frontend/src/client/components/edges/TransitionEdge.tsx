import { useState, useMemo } from 'react';
import { BaseEdge, EdgeProps, getSmoothStepPath } from 'reactflow';
import { ACTION_TYPE_CONFIGS } from '../../constants';

export default function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  labelStyle,
  data,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const fullLabel = (data as any)?.fullLabel || label;
  const actionConfig = (data as any)?.actionConfig || ACTION_TYPE_CONFIGS.action;
  
  const [edgePath, labelX, labelY] = useMemo(() => {
    return getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  const displayLabel = typeof label === 'string' ? label : '';
  const shortLabel = displayLabel.length > 15 ? `${displayLabel.substring(0, 12)}...` : displayLabel;

  return (
    <g>
      {/* Invisible wider path for easier hover interaction on the edge */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={30}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: actionConfig.color,
          strokeWidth: isHovered ? actionConfig.strokeWidth + 0.5 : actionConfig.strokeWidth,
          strokeDasharray: actionConfig.strokeDasharray,
          opacity: isHovered ? 1 : 0.85,
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }}
      />
      {label && (
        <g>
          {/* Calculate label dimensions */}
          {(() => {
            const labelWidth = shortLabel.length * 5.5 + 32; // Account for icon and padding
            const labelHeight = 24;
            const labelStartX = labelX - labelWidth / 2;
            const labelStartY = labelY - labelHeight / 2;
            
            return (
              <>
                {/* Label background with better styling - also a hover target */}
                <rect
                  x={labelStartX}
                  y={labelStartY}
                  width={labelWidth}
                  height={labelHeight}
                  rx={6}
                  fill={isHovered ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.95)'}
                  stroke={actionConfig.color}
                  strokeWidth={isHovered ? 2 : 1.5}
                  style={{ transition: 'all 0.2s ease', cursor: 'pointer' }}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                />
                {/* Icon */}
                <text
                  x={labelStartX + 12}
                  y={labelY + 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontSize: '12px', cursor: 'pointer', pointerEvents: 'none' }}
                >
                  {actionConfig.icon}
                </text>
                {/* Label text */}
                <text
                  x={labelStartX + 28}
                  y={labelY + 2}
                  textAnchor="start"
                  dominantBaseline="middle"
                  style={{
                    ...labelStyle,
                    fill: actionConfig.labelColor,
                    fontWeight: isHovered ? 600 : 500,
                    fontSize: '11px',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    pointerEvents: 'none',
                  }}
                  className="react-flow__edge-text"
                >
                  {shortLabel}
                </text>
                {/* Hover tooltip with full label - shows when hovering edge or label */}
                {isHovered && fullLabel && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={labelX - (fullLabel.length * 3.5)}
                      y={labelY - 40}
                      width={fullLabel.length * 7 + 16}
                      height={22}
                      rx={4}
                      fill="rgba(0, 0, 0, 0.9)"
                      stroke={actionConfig.color}
                      strokeWidth={1.5}
                    />
                    <text
                      x={labelX}
                      y={labelY - 27}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{
                        fill: 'white',
                        fontSize: '11px',
                        fontWeight: 500,
                        pointerEvents: 'none',
                      }}
                    >
                      {fullLabel}
                    </text>
                  </g>
                )}
              </>
            );
          })()}
        </g>
      )}
    </g>
  );
}

