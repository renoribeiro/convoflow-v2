import React, { createContext, useContext } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';

/**
 * Lets edges (the connecting "lines") be deleted from the canvas.
 * The builder provides `deleteEdge` via context so deletion flows through the
 * same setEdges + undo-history pipeline as every other change.
 */
interface FlowEdgeContextValue {
  deleteEdge: (id: string) => void;
}

export const FlowEdgeContext = createContext<FlowEdgeContextValue>({
  deleteEdge: () => {},
});

export function DeletableEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
  } = props;

  const { deleteEdge } = useContext(FlowEdgeContext);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <button
          type="button"
          title="Excluir conexão"
          className="nodrag nopan flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-xs leading-none text-muted-foreground opacity-70 shadow-sm transition-colors hover:border-destructive hover:bg-destructive hover:text-destructive-foreground hover:opacity-100"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          onClick={(e) => {
            e.stopPropagation();
            deleteEdge(id);
          }}
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

/** Register as the default edge so every connection becomes deletable. */
export const EDGE_TYPES = { default: DeletableEdge };
