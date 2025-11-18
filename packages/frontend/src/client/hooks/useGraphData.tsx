import React, { useEffect, useState } from 'react';
import { Node, Edge, MarkerType } from 'reactflow';
import dagre from 'dagre';
import { GraphData } from '../types';
import { getActionTypeConfig } from '../utils';

export function useGraphData(graphData: GraphData | null): { flowNodes: Node[]; flowEdges: Edge[] } {
  const [flowNodes, setFlowNodes] = useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (graphData && graphData.nodes.length > 0) {
      // Separate self-loops from regular edges
      const selfLoopsByNode = new Map<string, Array<GraphData['edges'][0]>>();
      const regularEdges: Array<GraphData['edges'][0]> = [];
      
      graphData.edges.forEach(edge => {
        if (edge.source === edge.target) {
          if (!selfLoopsByNode.has(edge.source)) {
            selfLoopsByNode.set(edge.source, []);
          }
          selfLoopsByNode.get(edge.source)!.push(edge);
        } else {
          regularEdges.push(edge);
        }
      });

      // Create Dagre graph for layout
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ 
        rankdir: 'TB', // Top to bottom
        nodesep: 100,  // Horizontal spacing between nodes
        ranksep: 150,  // Vertical spacing between ranks
        marginx: 50,
        marginy: 50,
      });

      // Add nodes to Dagre graph
      graphData.nodes.forEach(node => {
        g.setNode(node.id, { 
          width: 250, 
          height: 100 
        });
      });

      // Add only regular edges to Dagre (no self-loops)
      regularEdges.forEach(edge => {
        g.setEdge(edge.source, edge.target);
      });

      // Calculate layout
      dagre.layout(g);

      // Count connections for node styling
      const connectionCounts = new Map<string, { in: number; out: number; self: number }>();
      graphData.nodes.forEach(node => {
        connectionCounts.set(node.id, { in: 0, out: 0, self: 0 });
      });
      
      graphData.edges.forEach(edge => {
        if (edge.source === edge.target) {
          const counts = connectionCounts.get(edge.source)!;
          counts.self++;
        } else {
          const sourceCounts = connectionCounts.get(edge.source)!;
          sourceCounts.out++;
          const targetCounts = connectionCounts.get(edge.target)!;
          targetCounts.in++;
        }
      });

      // Create ReactFlow nodes with Dagre positions
      const nodes: Node[] = graphData.nodes.map(node => {
        const dagreNode = g.node(node.id);
        const counts = connectionCounts.get(node.id)!;
        const totalConnections = counts.in + counts.out;
        const hasSelfLoops = counts.self > 0;
        
        // Format URL for display
        const urlParts = node.url.split('/');
        const displayUrl = urlParts.length > 1 
          ? urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2] || node.url
          : node.url;
        const shortUrl = displayUrl.length > 40 ? `${displayUrl.substring(0, 40)}...` : displayUrl;
        
        return {
          id: node.id,
          type: 'default',
          position: { x: dagreNode.x - 125, y: dagreNode.y - 50 }, // Center the node
          data: {
            label: (
              <div style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  marginBottom: '6px', 
                  wordBreak: 'break-word',
                  fontSize: '0.9rem',
                  color: '#333',
                }}>
                  {shortUrl}
                </div>
                <div style={{ 
                  fontSize: '0.7rem', 
                  color: '#666',
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}>
                  <span>↗ {counts.out}</span>
                  <span>↙ {counts.in}</span>
                  {hasSelfLoops && (
                    <span style={{ color: '#f59e0b' }}>↻ {counts.self}</span>
                  )}
                </div>
              </div>
            ),
          },
          style: {
            background: hasSelfLoops ? '#fff8e1' : '#fff',
            border: hasSelfLoops ? '2px solid #f59e0b' : '2px solid #667eea',
            borderRadius: '8px',
            padding: '12px',
            width: 250,
            boxShadow: totalConnections > 10 ? '0 4px 12px rgba(102, 126, 234, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.1)',
          },
        };
      });

      // Create ReactFlow edges
      const edges: Edge[] = [];
      
      // Add regular edges with enhanced styling
      regularEdges.forEach((edge, index) => {
        // Extract action type from label
        const fullLabel = edge.label || 'action';
        const actionConfig = getActionTypeConfig(fullLabel);
        
        // Create a shorter label for display
        let shortLabel = fullLabel;
        if (fullLabel.length > 15) {
          shortLabel = fullLabel.substring(0, 12) + '...';
        }
        
        edges.push({
          id: `e-${edge.source}-${edge.target}-${index}`,
          source: edge.source,
          target: edge.target,
          type: 'transition',
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: actionConfig.color,
            width: 22,
            height: 22,
          },
          style: {
            stroke: actionConfig.color,
            strokeWidth: actionConfig.strokeWidth,
            strokeDasharray: actionConfig.strokeDasharray,
            opacity: 0.85,
          },
          label: shortLabel,
          labelStyle: {
            fill: actionConfig.labelColor,
            fontWeight: 500,
            fontSize: '11px',
          },
          labelShowBg: false, // We handle background in custom component
          data: {
            fullLabel: fullLabel,
            actionConfig: actionConfig,
          },
        });
      });

      // Add individual self-loop edges for each action
      selfLoopsByNode.forEach((loops, nodeId) => {
        loops.forEach((loop, loopIndex) => {
          const fullLabel = loop.label || 'self-loop';
          const actionConfig = getActionTypeConfig(fullLabel);
          
          // Create a shorter label for display
          let shortLabel = fullLabel;
          if (fullLabel.length > 15) {
            shortLabel = fullLabel.substring(0, 12) + '...';
          }
          
          // Offset each self-loop to avoid overlap
          // First loop at 60px, subsequent loops at 60 + (index * 40)px
          const offset = 60 + (loopIndex * 40);
          
          edges.push({
            id: `selfloop-${nodeId}-${loopIndex}`,
            source: nodeId,
            target: nodeId,
            type: 'selfloop',
            animated: false,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: actionConfig.color,
              width: 22,
              height: 22,
            },
            style: {
              stroke: actionConfig.color,
              strokeWidth: actionConfig.strokeWidth,
              strokeDasharray: actionConfig.strokeDasharray,
              opacity: 0.85,
            },
            label: shortLabel,
            labelStyle: {
              fill: actionConfig.labelColor,
              fontWeight: 500,
              fontSize: '11px',
            },
            labelShowBg: false, // We handle background in custom component
            data: {
              offset: offset,
              loopIndex: loopIndex,
              fullLabel: fullLabel,
              actionConfig: actionConfig,
            },
          });
        });
      });

      setFlowNodes(nodes);
      setFlowEdges(edges);
    } else {
      setFlowNodes([]);
      setFlowEdges([]);
    }
  }, [graphData]);

  return { flowNodes, flowEdges };
}

