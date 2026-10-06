
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Settings, Plus, Edit, Trash2 } from 'lucide-react';
import { SortableLeadCard } from './SortableLeadCard';
import { cn } from '@/lib/utils';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  value: number;
  lastContact: string;
  assignedTo: string;
}

interface FunnelStage {
  id: string;
  name: string;
  color: string;
  leads: Lead[];
}

interface DroppableStageProps {
  stage: FunnelStage;
  isDragActive: boolean;
  isOver: boolean;
  onConfigureStage?: (stageId: string) => void;
  onAddLead?: (stageId: string) => void;
  onEditStage?: (stageId: string) => void;
  onDeleteStage?: (stageId: string) => void;
}

export const DroppableStage = ({ 
  stage, 
  isDragActive, 
  isOver, 
  onConfigureStage,
  onAddLead,
  onEditStage,
  onDeleteStage 
}: DroppableStageProps) => {
  const { setNodeRef } = useDroppable({
    id: stage.id,
  });

  // Calculate dynamic count from actual leads
  const leadCount = stage.leads.length;

  return (
    <div 
      ref={setNodeRef}
      data-stage-id={stage.id}
      className={cn(
        "flex-shrink-0 w-80 transition-all duration-300 ease-out",
        isDragActive && "scale-[1.02]",
        isOver && "scale-105"
      )}
    >
      <Card className={cn(
        "h-full transition-all duration-300 ease-out min-h-[400px]",
        isDragActive && "ring-2 ring-primary/20 shadow-lg",
        isOver && "ring-4 ring-primary/40 shadow-xl bg-primary/5 scale-[1.01]"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {stage.name}
              <Badge className={cn(
                stage.color,
                "transition-all duration-200",
                isOver && "animate-pulse scale-110"
              )}>
                {leadCount}
              </Badge>
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onAddLead?.(stage.id)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Lead
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEditStage?.(stage.id)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar Estágio
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onConfigureStage?.(stage.id)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar Estágio
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onDeleteStage?.(stage.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir Estágio
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <SortableContext items={stage.leads.map(lead => lead.id)} strategy={verticalListSortingStrategy}>
            <div className={cn(
              "space-y-3 max-h-96 overflow-y-auto min-h-[200px] transition-all duration-300 p-2 rounded-lg",
              isDragActive && "bg-muted/5",
              isOver && "bg-primary/5 ring-2 ring-primary/20"
            )}>
              {stage.leads.map((lead) => (
                <SortableLeadCard key={lead.id} lead={lead} />
              ))}
              {stage.leads.length === 0 && (
                <div className={cn(
                  "text-center py-12 text-muted-foreground border-2 border-dashed border-muted rounded-lg transition-all duration-300 cursor-pointer",
                  isDragActive && "border-primary/30 bg-primary/5",
                  isOver && "border-primary/60 bg-primary/10 text-primary animate-bounce scale-105"
                )}>
                  <p className="text-sm font-medium">
                    {isOver ? "✨ Solte aqui!" : "📋 Arraste leads para cá"}
                  </p>
                  <p className="text-xs mt-1 opacity-70">
                    {isOver ? "Pronto para receber" : "Zona de drop ativa"}
                  </p>
                </div>
              )}
            </div>
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
};
