
import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { CheckCircle, Clock, Phone, Mail, MessageSquare, Calendar, Edit, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useFollowups } from '@/hooks/useFollowups'
import { FollowupEditModal } from '@/components/FollowupEditModal'
import type { IndividualFollowup } from '@/lib/followups/types'
import { toast } from 'sonner'

interface FollowupsListProps {
  status: 'pending' | 'today' | 'scheduled' | 'completed' | 'overdue'
  filters?: {
    search: string;
    type: string;
    priority: string;
    status: string;
    contactId: string;
    dateFrom?: Date;
    dateTo?: Date;
  }
}



export const FollowupsList = ({ status, filters }: FollowupsListProps) => {
  const { followups, loading, updateFollowup, deleteFollowup, completeFollowup, getFollowupsByStatus, getOverdueFollowups } = useFollowups()
  const [selectedFollowup, setSelectedFollowup] = useState<IndividualFollowup | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [completingFollowupId, setCompletingFollowupId] = useState<string | null>(null)
  const [editingFollowupId, setEditingFollowupId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Filter followups based on status and additional filters
  const getFilteredFollowups = (): IndividualFollowup[] => {
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

    let baseFollowups: IndividualFollowup[] = []

    switch (status) {
      case 'pending':
        baseFollowups = getFollowupsByStatus('pending')
        break
      case 'scheduled':
        baseFollowups = getFollowupsByStatus('scheduled')
        break
      case 'today':
        baseFollowups = followups.filter(f => {
          const dueDate = new Date(f.due_date)
          return dueDate >= todayStart && dueDate <= todayEnd && f.status !== 'completed'
        })
        break
      case 'completed':
        baseFollowups = getFollowupsByStatus('completed')
        break
      case 'overdue':
        baseFollowups = getOverdueFollowups()
        break
      default:
        baseFollowups = []
    }

    // Apply additional filters if provided
    if (!filters) return baseFollowups

    return baseFollowups.filter(followup => {
      // Search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase()
        const matchesSearch =
          followup.task.toLowerCase().includes(searchTerm) ||
          followup.notes?.toLowerCase().includes(searchTerm) ||
          (followup as any).contacts?.name?.toLowerCase().includes(searchTerm)
        if (!matchesSearch) return false
      }

      // Type filter
      if (filters.type && followup.type !== filters.type) {
        return false
      }

      // Priority filter
      if (filters.priority && followup.priority !== filters.priority) {
        return false
      }

      // Status filter (additional to the main status)
      if (filters.status && followup.status !== filters.status) {
        return false
      }

      // Contact filter
      if (filters.contactId && followup.contact_id !== filters.contactId) {
        return false
      }

      // Date range filter
      if (filters.dateFrom || filters.dateTo) {
        const followupDate = new Date(followup.due_date)
        
        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom)
          fromDate.setHours(0, 0, 0, 0)
          if (followupDate < fromDate) return false
        }
        
        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo)
          toDate.setHours(23, 59, 59, 999)
          if (followupDate > toDate) return false
        }
      }

      return true
    })
  }

  const filteredFollowups = useMemo(() => getFilteredFollowups(), [status, filters, followups])
  
  // Pagination logic
  const totalPages = Math.ceil(filteredFollowups.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedFollowups = filteredFollowups.slice(startIndex, endIndex)
  
  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="w-4 h-4" />
      case 'email': return <Mail className="w-4 h-4" />
      case 'message':
      case 'whatsapp': return <MessageSquare className="w-4 h-4" />
      case 'meeting': return <Calendar className="w-4 h-4" />
      case 'task': return <CheckCircle className="w-4 h-4" />
      default: return <Calendar className="w-4 h-4" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'Alta'
      case 'medium': return 'Média'
      case 'low': return 'Baixa'
      default: return priority
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'call': return 'Ligação'
      case 'email': return 'E-mail'
      case 'message': return 'Mensagem'
      case 'whatsapp': return 'WhatsApp'
      case 'meeting': return 'Reunião'
      case 'visit': return 'Visita'
      case 'task': return 'Tarefa'
      case 'other': return 'Outro'
      default: return type
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'overdue': return 'border-l-red-500 bg-red-50'
      case 'today': return 'border-l-blue-500 bg-blue-50'
      case 'completed': return 'border-l-green-500 bg-green-50'
      default: return 'border-l-gray-300'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const isToday = date.toDateString() === today.toDateString()
    const isTomorrow = date.toDateString() === tomorrow.toDateString()
    const isYesterday = date.toDateString() === yesterday.toDateString()

    const timeString = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    if (isToday) return `Hoje, ${timeString}`
    if (isTomorrow) return `Amanhã, ${timeString}`
    if (isYesterday) return `Ontem, ${timeString}`
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + `, ${timeString}`
  }

  const handleEdit = (followup: IndividualFollowup) => {
    if (editingFollowupId) return // Prevent multiple simultaneous edits
    
    setEditingFollowupId(followup.id)
    setSelectedFollowup(followup)
    setIsEditModalOpen(true)
  }

  const handleComplete = async (followup: IndividualFollowup) => {
    if (completingFollowupId) return // Prevent multiple simultaneous completions
    
    setCompletingFollowupId(followup.id)
    try {
      const success = await completeFollowup(followup.id)
      if (success) {
        toast.success('Follow-up concluído com sucesso!')
      } else {
        toast.error('Erro ao concluir follow-up')
      }
    } catch (error) {
      toast.error('Erro ao concluir follow-up')
    } finally {
      setCompletingFollowupId(null)
    }
  }

  const handleCloseModal = () => {
    setIsEditModalOpen(false)
    setSelectedFollowup(null)
    setEditingFollowupId(null)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-24" />
                    <div className="h-3 bg-gray-200 rounded w-32" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-6 bg-gray-200 rounded w-16" />
                  <div className="h-6 bg-gray-200 rounded w-20" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-3 bg-gray-200 rounded w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (filteredFollowups.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="w-full h-full" />}
        title={`Nenhum follow-up ${status === 'pending' ? 'pendente' : status}`}
        description="Quando houver tarefas neste status, elas aparecerão aqui"
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        {paginatedFollowups.map((followup) => (
        <Card key={followup.id} className={`border-l-4 ${getStatusColor(status)}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarFallback>
                    {((followup as any).contacts?.name || 'N/A').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-semibold">{(followup as any).contacts?.name || 'Contato não encontrado'}</h4>
                  <p className="text-sm text-muted-foreground">{(followup as any).contacts?.phone || 'N/A'}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Badge className={getPriorityColor(followup.priority)}>
                  {getPriorityLabel(followup.priority)}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  {getTypeIcon(followup.type)}
                  {getTypeLabel(followup.type)}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium">{followup.task}</p>
              <p className="text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 inline mr-1" />
                {formatDate(followup.due_date)}
              </p>
              {followup.notes && (
                <p className="text-sm bg-muted p-2 rounded">
                  <strong>Notas:</strong> {followup.notes}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4">
              {followup.status !== 'completed' && (
                <Button 
                  size="sm" 
                  variant="default"
                  onClick={() => handleComplete(followup)}
                  disabled={completingFollowupId === followup.id || !!completingFollowupId}
                >
                  {completingFollowupId === followup.id ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-1" />
                  )}
                  {completingFollowupId === followup.id ? 'Concluindo...' : 'Concluir'}
                </Button>
              )}
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleEdit(followup)}
                disabled={editingFollowupId === followup.id || !!editingFollowupId}
              >
                {editingFollowupId === followup.id ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Edit className="w-4 h-4 mr-1" />
                )}
                {editingFollowupId === followup.id ? 'Abrindo...' : 'Editar'}
              </Button>
            </div>
          </CardContent>
        </Card>
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-muted-foreground">
            Mostrando {startIndex + 1}-{Math.min(endIndex, filteredFollowups.length)} de {filteredFollowups.length} follow-ups
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <div className="flex items-center space-x-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="w-8 h-8 p-0"
                >
                  {page}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <FollowupEditModal
        followup={selectedFollowup}
        isOpen={isEditModalOpen}
        onClose={handleCloseModal}
        onSave={updateFollowup}
        onDelete={deleteFollowup}
      />
    </>
  )
}
