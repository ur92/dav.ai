import { EdgeTypes } from 'reactflow';
import TransitionEdge from './TransitionEdge';
import SelfLoopEdge from './SelfLoopEdge';

export const edgeTypes: EdgeTypes = {
  transition: TransitionEdge,
  selfloop: SelfLoopEdge,
};

