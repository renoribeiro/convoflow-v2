
import { DragOverlay as DndDragOverlay } from '@dnd-kit/core';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';

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

interface DragOverlayProps {
  draggedLead: Lead | null;
}

export const DragOverlay = ({ draggedLead }: DragOverlayProps) => {
  if (!draggedLead) return null;

  return (
    <DndDragOverlay
      style={{
        cursor: 'grabbing',
        transform: 'rotate(-2deg) scale(1.05)',
      }}
    >
      <Card className="w-80 shadow-2xl border-2 border-primary/50 bg-card/95 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-primary/10">
                  {draggedLead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h4 className="font-medium text-sm">{draggedLead.name}</h4>
                <p className="text-xs text-muted-foreground">{draggedLead.lastContact}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {draggedLead.source}
              </Badge>
              <span className="text-sm font-semibold text-green-600">
                R$ {draggedLead.value.toLocaleString()}
              </span>
            </div>
            
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              {draggedLead.assignedTo}
            </div>
          </div>
        </CardContent>
      </Card>
    </DndDragOverlay>
  );
};
