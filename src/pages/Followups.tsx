
import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { FollowupsList } from '@/components/followups/FollowupsList'
import { FollowupScheduler } from '@/components/followups/FollowupScheduler'
import { FollowupCalendarModal } from '@/components/followups/FollowupCalendarModal'
import { FollowupFilters } from '@/components/followups/FollowupFilters'
import { SequencesManager } from '@/components/followups/SequencesManager'
import { Plus, Clock, CheckCircle, AlertCircle, Calendar, Filter, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { useFollowups } from '@/hooks/useFollowups'

export default function Followups() {
  const [showScheduler, setShowScheduler] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    search: '',
    type: '',
    priority: '',
    status: '',
    contactId: '',
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined
  })
  const { stats, loading } = useFollowups()

  // Calculate completed today from stats
  const completedToday = stats.completed // This could be enhanced to filter by today's date

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-ups"
        helpKey="page:followups"
        description="Gerencie e acompanhe todas as suas tarefas de follow-up com clientes"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Follow-ups' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filtros
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowCalendar(true)}
            >
              <Calendar className="w-4 h-4 mr-2" />
              Calendário
            </Button>
            <Button size="sm" onClick={() => setShowScheduler(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Follow-up
            </Button>
          </div>
        }
      />

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Follow-ups</p>
                {loading ? (
                  <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold">{stats.total}</p>
                )}
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pendentes</p>
                {loading ? (
                  <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
                )}
              </div>
              <AlertCircle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Concluídos</p>
                {loading ? (
                  <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                )}
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Agendados</p>
                {loading ? (
                  <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold text-purple-600">{stats.scheduled}</p>
                )}
              </div>
              <Send className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Em Atraso</p>
                {loading ? (
                  <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                ) : (
                  <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
                )}
              </div>
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      {showFilters && (
        <FollowupFilters 
          filters={filters} 
          onFiltersChange={setFilters} 
        />
      )}

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="today">Hoje</TabsTrigger>
          <TabsTrigger value="scheduled">Agendados</TabsTrigger>
          <TabsTrigger value="overdue">Em Atraso</TabsTrigger>
          <TabsTrigger value="completed">Concluídos</TabsTrigger>
          <TabsTrigger value="sequences">Sequências</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <FollowupsList status="pending" filters={filters} />
        </TabsContent>

        <TabsContent value="today">
          <FollowupsList status="today" filters={filters} />
        </TabsContent>

        <TabsContent value="scheduled">
          <FollowupsList status="scheduled" filters={filters} />
        </TabsContent>

        <TabsContent value="overdue">
          <FollowupsList status="overdue" filters={filters} />
        </TabsContent>

        <TabsContent value="completed">
          <FollowupsList status="completed" filters={filters} />
        </TabsContent>

        <TabsContent value="sequences">
          <SequencesManager />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {showScheduler && (
        <FollowupScheduler onClose={() => setShowScheduler(false)} />
      )}
      <FollowupCalendarModal 
        isOpen={showCalendar} 
        onClose={() => setShowCalendar(false)} 
      />
    </div>
  )
}
