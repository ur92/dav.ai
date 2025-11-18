import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { Node, Edge } from 'reactflow';
import { GraphData } from '../types';
import { ACTION_TYPE_CONFIGS } from '../constants';
import { edgeTypes } from './edges';

interface VisualizationPanelProps {
  graphData: GraphData | null;
  flowNodes: Node[];
  flowEdges: Edge[];
  currentSession: string | null;
}

export default function VisualizationPanel({
  graphData,
  flowNodes,
  flowEdges,
  currentSession,
}: VisualizationPanelProps) {
  return (
    <section className="visualization-panel">
      <h2>🗺️ Exploration Visualization</h2>
      <div className="narrative-box">
        <p><strong>Visualization:</strong> Interactive mapping of exploration paths, interaction flows, and state transitions discovered by the agent.</p>
      </div>
      {graphData ? (
        <>
          <div className="graph-stats">
            <div className="stat-item">
              <strong>{graphData.nodes.length}</strong> States
            </div>
            <div className="stat-item">
              <strong>{graphData.edges.length}</strong> Transitions
            </div>
          </div>
          <div className="edge-legend" style={{
            marginTop: '0.75rem',
            marginBottom: '0.75rem',
            padding: '0.75rem',
            background: '#f8f9fa',
            borderRadius: '6px',
            fontSize: '0.85rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600, color: '#555', marginRight: '0.5rem' }}>Edge Types:</span>
            {Object.entries(ACTION_TYPE_CONFIGS).map(([key, config]) => (
              <div key={key} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}>
                <svg width="24" height="4" style={{ overflow: 'visible' }}>
                  <line
                    x1="0"
                    y1="2"
                    x2="24"
                    y2="2"
                    stroke={config.color}
                    strokeWidth="3"
                    strokeDasharray={config.strokeDasharray || '0'}
                    strokeLinecap="round"
                  />
                </svg>
                <span style={{ color: '#666' }}>
                  {config.icon} {key.charAt(0).toUpperCase() + key.slice(1)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {flowNodes.length > 0 ? (
        <div className="flow-container">
          <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
            Showing graph for: <strong>{currentSession?.substring(0, 30)}...</strong>
          </div>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
            attributionPosition="bottom-left"
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          >
            <Background gap={20} size={1} />
            <Controls />
            <MiniMap 
              nodeColor={(node) => {
                const hasSelfLoop = flowEdges.some(e => e.source === node.id && e.target === node.id);
                return hasSelfLoop ? '#f59e0b' : '#667eea';
              }}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
          </ReactFlow>
        </div>
      ) : (
        <div className="empty-state">
          <p>No visualization data available for this session.</p>
          <p>The session may still be running or hasn't generated any graph data yet.</p>
        </div>
      )}
    </section>
  );
}

