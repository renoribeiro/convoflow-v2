import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFollowups } from '@/hooks/useFollowups';
import { toast } from 'sonner';
import { Calendar, Clock, User } from 'lucide-react';

interface FollowupModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
}

const FOLLOWUP_TYPES = [
  { value: 'call', label: 'Ligação' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'visit', label: 'Visita' },
  { value: 'other', label: 'Outro' },
];

export function FollowupModal({ isOpen, onClose, contactId, contactName }: FollowupModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [type, setType] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const { createFollowup } = useFollowups();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !scheduledDate || !scheduledTime || !type) {
      toast.error('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    setIsLoading(true);

    try {
      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      
      await createFollowup({
        title: title.trim(),
        description: description.trim() || null,
        contact_id: contactId,
        scheduled_date: scheduledDateTime.toISOString(),
        type,
        status: 'pending',
      });

      toast.success('Follow-up agendado com sucesso!');
      handleClose();
    } catch (error) {
      console.error('Erro ao criar follow-up:', error);
      toast.error('Erro ao agendar follow-up. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setScheduledDate('');
    setScheduledTime('');
    setType('');
    onClose();
  };

  // Definir data mínima como hoje
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Agendar Follow-up
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            {contactName}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ligação de acompanhamento"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo *</Label>
            <Select value={type} onValueChange={setType} required>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo de follow-up" />
              </SelectTrigger>
              <SelectContent>
                {FOLLOWUP_TYPES.map((followupType) => (
                  <SelectItem key={followupType.value} value={followupType.value}>
                    {followupType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={today}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Horário *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Adicione detalhes sobre o follow-up..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Agendando...' : 'Agendar Follow-up'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}