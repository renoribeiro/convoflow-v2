import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar, Trash2, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import type { IndividualFollowup, UpdateFollowupData } from '@/lib/followups/types'

interface FollowupEditModalProps {
  followup: IndividualFollowup | null
  isOpen: boolean
  onClose: () => void
  onSave: (id: string, data: UpdateFollowupData) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baixa', color: 'text-green-600' },
  { value: 'medium', label: 'Média', color: 'text-yellow-600' },
  { value: 'high', label: 'Alta', color: 'text-red-600' }
]

const TYPE_OPTIONS = [
  { value: 'call', label: 'Ligação' },
  { value: 'message', label: 'Mensagem' },
  { value: 'email', label: 'E-mail' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'task', label: 'Tarefa' },
  { value: 'other', label: 'Outro' }
]

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendente' },
  { value: 'completed', label: 'Concluído' },
  { value: 'cancelled', label: 'Cancelado' }
]

const RECURRING_TYPE_OPTIONS = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' }
]

export function FollowupEditModal({
  followup,
  isOpen,
  onClose,
  onSave,
  onDelete
}: FollowupEditModalProps) {
  const [formData, setFormData] = useState<UpdateFollowupData>({})
  const [loading, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Initialize form data when followup changes
  useEffect(() => {
    if (followup) {
      setFormData({
        task: followup.task,
        type: followup.type,
        priority: followup.priority,
        due_date: followup.due_date.split('T')[0], // Format for date input
        notes: followup.notes || '',
        status: followup.status || 'pending',
        recurring: followup.recurring || false,
        recurring_type: followup.recurring_type || undefined,
        recurring_count: followup.recurring_count || undefined
      })
    }
  }, [followup])

  const handleInputChange = (field: keyof UpdateFollowupData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!followup) return

    // Validation
    if (!formData.task?.trim()) {
      toast.error('O campo tarefa é obrigatório')
      return
    }

    if (!formData.due_date) {
      toast.error('A data de vencimento é obrigatória')
      return
    }

    setSaving(true)
    try {
      // Format due_date to include time
      const formattedData = {
        ...formData,
        due_date: formData.due_date ? `${formData.due_date}T23:59:59.999Z` : undefined
      }

      const success = await onSave(followup.id, formattedData)
      if (success) {
        onClose()
      }
    } catch (error) {
      toast.error('Erro ao salvar follow-up')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!followup) return

    if (!confirm('Tem certeza que deseja excluir este follow-up?')) {
      return
    }

    setDeleting(true)
    try {
      const success = await onDelete(followup.id)
      if (success) {
        onClose()
      }
    } catch (error) {
      toast.error('Erro ao excluir follow-up')
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR')
  }

  if (!followup) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Editar Follow-up
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Contact Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Informações do Contato</h3>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Nome:</span> {(followup as any).contacts?.name || 'N/A'}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">Telefone:</span> {(followup as any).contacts?.phone || 'N/A'}
            </p>
          </div>

          {/* Task */}
          <div className="space-y-2">
            <Label htmlFor="task">Tarefa *</Label>
            <Input
              id="task"
              value={formData.task || ''}
              onChange={(e) => handleInputChange('task', e.target.value)}
              placeholder="Descreva a tarefa do follow-up"
            />
          </div>

          {/* Type and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select
                value={formData.type || ''}
                onValueChange={(value) => handleInputChange('type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Prioridade</Label>
              <Select
                value={formData.priority || ''}
                onValueChange={(value) => handleInputChange('priority', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a prioridade" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className={option.color}>{option.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due Date and Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due_date">Data de Vencimento *</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date || ''}
                onChange={(e) => handleInputChange('due_date', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status || ''}
                onValueChange={(value) => handleInputChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Adicione observações sobre este follow-up"
              rows={3}
            />
          </div>

          {/* Recurring Options */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="recurring"
                checked={formData.recurring || false}
                onCheckedChange={(checked) => handleInputChange('recurring', checked)}
              />
              <Label htmlFor="recurring">Follow-up recorrente</Label>
            </div>

            {formData.recurring && (
              <div className="grid grid-cols-2 gap-4 ml-6">
                <div className="space-y-2">
                  <Label htmlFor="recurring_type">Tipo de Recorrência</Label>
                  <Select
                    value={formData.recurring_type || ''}
                    onValueChange={(value) => handleInputChange('recurring_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRING_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recurring_count">Número de Repetições</Label>
                  <Input
                    id="recurring_count"
                    type="number"
                    min="1"
                    value={formData.recurring_count || ''}
                    onChange={(e) => handleInputChange('recurring_count', parseInt(e.target.value) || undefined)}
                    placeholder="Ex: 5"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">Informações</h3>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <p>
                <span className="font-medium">Criado em:</span> {formatDate(followup.created_at)}
              </p>
              <p>
                <span className="font-medium">Atualizado em:</span> {formatDate(followup.updated_at)}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || loading}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? 'Excluindo...' : 'Excluir'}
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading || deleting}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || deleting}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}