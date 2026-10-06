import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatbotNodeType } from '@/types/chatbot-flow.types';
import { BLOCK_BY_TYPE } from '@/lib/chatbot/flowConstants';

export interface BaseNodeProps {
  id: string;
  type: ChatbotNodeType;
  selected?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onDelete?: (id: string) => void;
  showSourceHandle?: boolean;
  showTargetHandle?: boolean;
  children?: React.ReactNode;
  /** Override handles entirely (for condition/show_options). */
  customHandles?: React.ReactNode;
}

const BaseNode: React.FC<BaseNodeProps> = ({
  id,
  type,
  selected,
  hasError,
  errorMessage,
  onDelete,
  showSourceHandle = true,
  showTargetHandle = true,
  children,
  customHandles,
}) => {
  const block = BLOCK_BY_TYPE[type];

  return (
    <div
      className={cn(
        'relative min-w-[200px] max-w-[240px] rounded-lg border bg-card shadow-md',
        selected && 'ring-2 ring-[hsl(var(--primary))]',
        hasError && 'border-destructive ring-2 ring-destructive'
      )}
    >
      {/* Target handle */}
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !border-2 !border-[hsl(var(--primary))] !bg-background"
        />
      )}

      {/* Header */}
      <div className={cn('flex items-center justify-between px-3 py-2 rounded-t-lg', block.headerClass)}>
        <div className="flex items-center gap-1.5 text-white">
          <span className="text-sm">{block.emoji}</span>
          <span className="text-xs font-semibold leading-tight truncate">{block.label}</span>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(id)}
            className="text-white/70 hover:text-white transition-colors ml-1"
            title="Remover nó"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2 text-xs text-muted-foreground min-h-[32px]">
        {children}
      </div>

      {/* Error banner */}
      {hasError && errorMessage && (
        <div className="px-3 py-1 text-xs text-destructive bg-destructive/10 rounded-b-lg border-t border-destructive/20">
          {errorMessage}
        </div>
      )}

      {/* Handles */}
      {customHandles ?? (
        showSourceHandle && (
          <Handle
            type="source"
            position={Position.Bottom}
            id="default"
            className="!w-3 !h-3 !border-2 !border-[hsl(var(--primary))] !bg-background"
          />
        )
      )}
    </div>
  );
};

export default BaseNode;
