
import { useState, useEffect } from 'react';
import { DndContext, rectIntersection, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import { DroppableStage } from './DroppableStage';
import { DragOverlay } from './DragOverlay';
import { StageConfigModal } from './StageConfigModal';
import { EditStageModal } from './EditStageModal';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useLojaContactLastMessage } from '@/hooks/useLojaStats';
import { Skeleton } from '@/components/ui/skeleton';
import { contactChannel, contactIdentifier, type ContactIdentity } from '@/lib/contacts/identity';
import { contactDisplayName } from '@/lib/instagram/contactProfile';

interface Lead {
  id: string;
  name: string;
  email: string;
  /** Linha de identificação do card: telefone (WhatsApp) ou @ (Instagram). */
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



export const FunnelBoard = () => {
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, string>>({});
  const [showStageConfig, setShowStageConfig] = useState(false);
  const [editingStage, setEditingStage] = useState<{ id: string; name: string; color: string; order: number } | null>(null);
  const { toast } = useToast();

  // Buscar estágios do funil
  const { data: stagesData = [], isLoading: stagesLoading } = useSupabaseQuery({
    table: 'funnel_stages',
    select: 'id, name, color, order',
    orderBy: [{ column: 'order', ascending: true }],
    staleTime: 5 * 60 * 1000
  });

  // Buscar contatos simples primeiro
  const { data: contactsData = [], isLoading: contactsLoading } = useSupabaseQuery({
    table: 'contacts',
    select: 'id, name, email, phone, channel, username, lead_source_id, current_stage_id, created_at'
  });

  // Buscar lead_sources separadamente
  const { data: leadSourcesData = [] } = useSupabaseQuery({
    table: 'lead_sources',
    select: 'id, name'
  });

  // Último contato por lead: só o INSTANTE da última mensagem, por contato, da
  // Loja inteira (loja_contact_last_message, migração 20260914000001). Antes
  // vinha das 100 mensagens mais recentes de `messages`, o que (a) deixava
  // "Nunca" em quem estava fora dessa janela e (b) passaria a esconder o
  // último contato de conversas que um atendente restrito não vê.
  const { data: lastMessages = [] } = useLojaContactLastMessage();
  const lastMessageByContact = new Map(lastMessages.map((r) => [r.contact_id, r.last_at]));

  // Processar dados para criar estrutura do funil
  const stages: FunnelStage[] = stagesData.map(stage => ({
    id: stage.id,
    name: stage.name,
    color: stage.color || 'bg-gray-100 text-gray-800',
    leads: contactsData?.filter(contact => {
      // Aplicar atualizações otimistas
      const currentStageId = optimisticUpdates[contact.id] || contact.current_stage_id;
      return currentStageId === stage.id;
    }).map(contact => {
      // Encontrar lead source
      const leadSource = leadSourcesData.find(ls => ls.id === contact.lead_source_id);
      
      // Canal/@ do contato (o tipo genérico da consulta não conhece as colunas)
      const identity = contact as unknown as ContactIdentity;

      // Encontrar última mensagem
      const lastMessageAt = lastMessageByContact.get(contact.id);
      
      return {
        id: contact.id,
        // WhatsApp como sempre; Instagram sem nome mostra o @, e o @ fica no
        // lugar do telefone (que ele não tem).
        name: contactChannel(identity) === 'instagram'
          ? contactDisplayName(identity, 'instagram')
          : contact.name || 'Contato sem nome',
        email: contact.email || '',
        phone: contactIdentifier(identity),
        source: leadSource?.name || 'Desconhecido',
        value: 0,
        lastContact: lastMessageAt
          ? new Date(lastMessageAt).toLocaleDateString('pt-BR')
          : 'Nunca',
        assignedTo: 'Não atribuído'
      };
    }) || []
  }));

  const isLoading = stagesLoading || contactsLoading;

  // Mutation para atualizar estágio do contato
  const updateStageMutation = useSupabaseMutation({
    table: 'contacts',
    operation: 'update',
    onSuccess: (data, variables) => {
      // Limpar atualização otimista após sucesso
      const contactId = variables.options?.filter?.value;
      if (contactId) {
        setOptimisticUpdates(prev => {
          const newUpdates = { ...prev };
          delete newUpdates[contactId];
          return newUpdates;
        });
      }
      
      toast({
        title: 'Sucesso',
        description: 'Contato movido para novo estágio'
      });
    },
    onError: (error: Error, variables) => {
      // Reverter atualização otimista em caso de erro
      const contactId = variables.options?.filter?.value;
      if (contactId) {
        setOptimisticUpdates(prev => {
          const newUpdates = { ...prev };
          delete newUpdates[contactId];
          return newUpdates;
        });
      }
      
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao mover contato',
        variant: 'destructive'
      });
    },
    invalidateQueries: [
      ['contacts'],
      ['funnel_stages'],
      ['lead_sources'],
      ['conversations']
    ]
  });

  // Funções de callback para ações dos estágios
  const handleConfigureStage = (stageId: string) => {
    setShowStageConfig(true);
  };

  const handleAddLead = (stageId: string) => {
    // TODO: Implementar modal de adicionar lead
    toast({
      title: "Em desenvolvimento",
      description: "Funcionalidade de adicionar lead será implementada em breve.",
    });
  };

  const handleEditStage = (stageId: string) => {
    const stage = stagesData.find(s => s.id === stageId);
    if (stage) {
      setEditingStage({
        id: stage.id,
        name: stage.name,
        color: stage.color || 'blue',
        order: stage.order
      });
    }
  };

  const handleDeleteStage = (stageId: string) => {
    // TODO: Implementar exclusão de estágio
    toast({
      title: "Em desenvolvimento",
      description: "Funcionalidade de excluir estágio será implementada em breve.",
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setIsDragActive(true);
    
    // Find the dragged lead
    for (const stage of stages) {
      const foundLead = stage.leads.find(lead => lead.id === active.id);
      if (foundLead) {
        setDraggedLead(foundLead);
        break;
      }
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    
    if (over) {
      // Check if over a stage
      const targetStage = stages.find(stage => stage.id === over.id);
      if (targetStage) {
        setOverStageId(over.id as string);
      } else {
        // Check if over a lead (to determine which stage)
        for (const stage of stages) {
          if (stage.leads.some(lead => lead.id === over.id)) {
            setOverStageId(stage.id);
            break;
          }
        }
      }
    } else {
      setOverStageId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setIsDragActive(false);
    setDraggedLead(null);
    setOverStageId(null);

    if (!over || !draggedLead) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find source stage
    let sourceStageId: string | null = null;
    for (const stage of stages) {
      if (stage.leads.some(lead => lead.id === activeId)) {
        sourceStageId = stage.id;
        break;
      }
    }

    if (!sourceStageId) return;

    // Determine target stage - improved detection
    let targetStageId: string | null = null;
    
    // First check if dropped directly on a stage
    const targetStage = stages.find(stage => stage.id === overId);
    if (targetStage) {
      targetStageId = overId;
    } else {
      // Check if dropped on a lead (to determine which stage)
      for (const stage of stages) {
        if (stage.leads.some(lead => lead.id === overId)) {
          targetStageId = stage.id;
          break;
        }
      }
    }

    // If still no target found, try to find the closest stage based on mouse position
    if (!targetStageId && over.rect) {
      const overRect = over.rect;
      for (const stage of stages) {
        const stageElement = document.querySelector(`[data-stage-id="${stage.id}"]`);
        if (stageElement) {
          const stageRect = stageElement.getBoundingClientRect();
          if (
            overRect.left >= stageRect.left &&
            overRect.left <= stageRect.right &&
            overRect.top >= stageRect.top &&
            overRect.top <= stageRect.bottom
          ) {
            targetStageId = stage.id;
            break;
          }
        }
      }
    }

    if (targetStageId && targetStageId !== sourceStageId) {
      // Atualização otimista - aplicar mudança imediatamente
      setOptimisticUpdates(prev => ({
        ...prev,
        [activeId]: targetStageId
      }));

      // Atualizar estágio no Supabase
      updateStageMutation.mutate({
        data: { current_stage_id: targetStageId },
        options: {
          filter: { column: 'id', operator: 'eq', value: activeId }
        }
      });
    }
  };

  const handleDragCancel = () => {
    setIsDragActive(false);
    setDraggedLead(null);
    setOverStageId(null);
  };

  // Estado de carregamento
  if (isLoading) {
    return (
      <div className="flex gap-6 overflow-x-auto pb-4 px-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="min-w-[300px] bg-gray-50 rounded-lg p-4">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-6 overflow-x-auto pb-4 px-2">
        {stages.map((stage) => (
          <DroppableStage
            key={stage.id}
            stage={stage}
            isDragActive={isDragActive}
            isOver={overStageId === stage.id}
            onConfigureStage={handleConfigureStage}
            onAddLead={handleAddLead}
            onEditStage={handleEditStage}
            onDeleteStage={handleDeleteStage}
          />
        ))}
      </div>
      
      <DragOverlay draggedLead={draggedLead} />
      
      <StageConfigModal 
        isOpen={showStageConfig} 
        onClose={() => setShowStageConfig(false)} 
      />
      
      <EditStageModal
        isOpen={!!editingStage}
        onClose={() => setEditingStage(null)}
        stage={editingStage}
        onStageUpdated={() => {
          // Força uma nova busca dos dados após atualização
          window.location.reload();
        }}
      />
    </DndContext>
  );
};
