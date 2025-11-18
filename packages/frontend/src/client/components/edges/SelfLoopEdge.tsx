import { useState, useMemo } from 'react';
import { BaseEdge, EdgeProps } from 'reactflow';
import { ACTION_TYPE_CONFIGS } from '../../constants';

export default function SelfLoopEdge({
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
  const offset = (data as any)?.offset || 60;
  const radius = offset;
  
  const [edgePath, labelX, labelY, hoverPath] = useMemo(() => {
    // Create a proper circular/elliptical loop on the side of the node
    const loopIndex = (data as any)?.loopIndex || 0;
    const nodeWidth = 250; // Approximate node width
    const nodeHeight = 100; // Approximate node height
    
    // Position loops on the right side of the node, offset vertically for multiple loops
    // Center the first loop vertically, then offset others above/below
    let verticalOffset = 0;
    if (loopIndex > 0) {
      // Alternate above and below: 1st extra = +30, 2nd extra = -30, 3rd = +60, 4th = -60, etc.
      const offsetDirection = loopIndex % 2 === 1 ? 1 : -1;
      const offsetAmount = Math.ceil(loopIndex / 2) * 30;
      verticalOffset = offsetDirection * offsetAmount;
    }
    
    // Create a proper circular loop path on the right side
    // Start from right-center of node, go right and around in a circle, end back at right-center
    const startX = sourceX + nodeWidth / 2;
    const startY = sourceY + verticalOffset; // sourceY is the vertical center of the node
    const rightX = startX + radius;
    const centerY = sourceY + verticalOffset;
    
    // Create a smooth circular loop using cubic bezier curves
    // The loop goes: start (right-center) -> right and up -> right -> right and down -> back to start
    // Use control points to create a nice circular arc
    const topControlX = startX + radius * 0.55;
    const topControlY = startY - radius * 0.45;
    const rightTopX = rightX;
    const rightTopY = centerY - radius * 0.4;
    
    const rightBottomX = rightX;
    const rightBottomY = centerY + radius * 0.4;
    const bottomControlX = startX + radius * 0.55;
    const bottomControlY = startY + radius * 0.45;
    
    // Create a smooth closed loop using cubic bezier curves
    // Path: start -> curve right-up -> right -> curve right-down -> back to start
    const path = `M ${startX} ${startY} 
                  C ${topControlX} ${topControlY}, ${rightTopX} ${rightTopY}, ${rightX} ${centerY}
                  C ${rightBottomX} ${rightBottomY}, ${bottomControlX} ${bottomControlY}, ${startX} ${startY} Z`;
    
    // Create a wider hover path for easier interaction (same path, just for hover detection)
    const hoverPath = path;
    
    // Label position at the right side of the loop
    return [path, rightX + 15, centerY, hoverPath];
  }, [sourceX, sourceY, radius, data]);

  const displayLabel = typeof label === 'string' ? label : '';
  const shortLabel = displayLabel.length > 15 ? `${displayLabel.substring(0, 12)}...` : displayLabel;

  return (
    <g>
      {/* Invisible wider path for easier hover interaction on the edge */}
      <path
        d={hoverPath}
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
          strokeDasharray: actionConfig.strokeDasharray || style.strokeDasharray,
          opacity: isHovered ? 1 : 0.85,
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }}
      />
      {label && (
        <g>
          {/* Calculate label dimensions */}
          {(() => {
            const labelWidth = shortLabel.length * 5.5 + 32;
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

