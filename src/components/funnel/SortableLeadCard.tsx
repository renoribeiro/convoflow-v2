
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Edit, MessageCircle, Calendar, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ContactModal } from '@/components/contacts/ContactModal';
import { FollowupModal } from '@/components/followups/FollowupModal';
import { toast } from 'sonner';

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

interface SortableLeadCardProps {
  lead: Lead;
}

export const SortableLeadCard = ({ lead }: SortableLeadCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: lead.id });

  const navigate = useNavigate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditModalOpen(true);
  };

  const handleChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navegar para a página de conversas com o contato específico
    navigate(`/dashboard/conversations?contact=${lead.id}`);
    toast.success(`Abrindo conversa com ${lead.name}`);
  };

  const handleScheduleFollowup = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFollowupModalOpen(true);
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      className={cn(
        "group transition-all duration-200 ease-out",
        isDragging && "z-50"
      )}
    >
      <Card className={cn(
        "mb-3 cursor-grab active:cursor-grabbing transition-all duration-200 ease-out",
        "hover:shadow-lg hover:scale-[1.02] hover:-translate-y-1",
        "group-hover:ring-2 group-hover:ring-primary/20",
        isDragging && "opacity-40 scale-95 rotate-2 shadow-2xl ring-4 ring-primary/30",
        isOver && "ring-2 ring-primary/40 shadow-lg scale-[1.01]",
        !isDragging && "hover:bg-card/80"
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Avatar className={cn(
                "w-8 h-8 transition-all duration-200",
                isDragging && "ring-2 ring-primary/50"
              )}>
                <AvatarFallback className="text-xs">
                  {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h4 className="font-medium text-sm">{lead.name}</h4>
                <p className="text-xs text-muted-foreground">{lead.lastContact}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleChat}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Conversar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleScheduleFollowup}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Agendar Follow-up
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {lead.source}
              </Badge>
              <span className={cn(
                "text-sm font-semibold text-green-600 transition-all duration-200",
                isDragging && "text-primary font-bold"
              )}>
                R$ {lead.value.toLocaleString()}
              </span>
            </div>
            
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              {lead.assignedTo}
            </div>

            <div className="text-xs text-muted-foreground">
              {lead.phone}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Edição */}
      <ContactModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        contactId={lead.id}
      />

      {/* Modal de Follow-up */}
      <FollowupModal
        isOpen={isFollowupModalOpen}
        onClose={() => setIsFollowupModalOpen(false)}
        contactId={lead.id}
        contactName={lead.name}
      />
    </div>
  );
};
