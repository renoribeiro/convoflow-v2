import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Download,
  Upload,
  Database,
  Clock,
  CheckCircle,
  AlertTriangle,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Calendar,
  HardDrive,
  Shield,
  FileText
} from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface BackupRecord {
  id: string;
  name: string;
  type: 'full' | 'incremental' | 'differential';
  status: 'completed' | 'running' | 'failed' | 'scheduled';
  size: number;
  created_at: string;
  completed_at?: string;
  description?: string;
  tables_included: string[];
  file_path?: string;
}

interface BackupSchedule {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  type: 'full' | 'incremental';
  is_active: boolean;
  retention_days: number;
  tables_included: string[];
  next_run: string;
}

const mockBackups: BackupRecord[] = [
  {
    id: '1',
    name: 'Backup Completo - Janeiro 2025',
    type: 'full',
    status: 'completed',
    size: 2.4 * 1024 * 1024 * 1024, // 2.4 GB
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 1.5).toISOString(),
    description: 'Backup completo de todos os dados',
    tables_included: ['contacts', 'messages', 'campaigns', 'chatbots', 'automation_flows'],
    file_path: '/backups/full_backup_20250103.sql'
  },
  {
    id: '2',
    name: 'Backup Incremental - Hoje',
    type: 'incremental',
    status: 'running',
    size: 156 * 1024 * 1024, // 156 MB
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    tables_included: ['messages', 'contacts'],
    file_path: '/backups/incremental_20250103_14h30.sql'
  },
  {
    id: '3',
    name: 'Backup Semanal - Dezembro',
    type: 'full',
    status: 'completed',
    size: 2.1 * 1024 * 1024 * 1024, // 2.1 GB
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7 + 1000 * 60 * 45).toISOString(),
    tables_included: ['contacts', 'messages', 'campaigns', 'chatbots'],
    file_path: '/backups/weekly_backup_20241227.sql'
  }
];

const mockSchedules: BackupSchedule[] = [
  {
    id: '1',
    name: 'Backup Diário Automático',
    frequency: 'daily',
    time: '02:00',
    type: 'incremental',
    is_active: true,
    retention_days: 30,
    tables_included: ['messages', 'contacts'],
    next_run: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString()
  },
  {
    id: '2',
    name: 'Backup Semanal Completo',
    frequency: 'weekly',
    time: '01:00',
    type: 'full',
    is_active: true,
    retention_days: 90,
    tables_included: ['contacts', 'messages', 'campaigns', 'chatbots', 'automation_flows'],
    next_run: new Date(Date.now() + 1000 * 60 * 60 * 24 * 6).toISOString()
  }
];

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'running':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'scheduled':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4" />;
    case 'running':
      return <Clock className="h-4 w-4" />;
    case 'failed':
      return <AlertTriangle className="h-4 w-4" />;
    case 'scheduled':
      return <Calendar className="h-4 w-4" />;
    default:
      return <Database className="h-4 w-4" />;
  }
};

const BackupList = () => {
  const { toast } = useToast();

  const handleDownload = (backup: BackupRecord) => {
    toast({
      title: "Download iniciado",
      description: `Fazendo download do backup: ${backup.name}`
    });
  };

  const handleRestore = (backup: BackupRecord) => {
    toast({
      title: "Restauração iniciada",
      description: `Restaurando dados do backup: ${backup.name}`,
      variant: "destructive"
    });
  };

  return (
    <div className="space-y-4">
      {mockBackups.map((backup) => (
        <Card key={backup.id}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="font-semibold">{backup.name}</h3>
                  <Badge className={getStatusColor(backup.status)}>
                    {getStatusIcon(backup.status)}
                    <span className="ml-1 capitalize">{backup.status}</span>
                  </Badge>
                  <Badge variant="outline">
                    {backup.type === 'full' ? 'Completo' : backup.type === 'incremental' ? 'Incremental' : 'Diferencial'}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium">Tamanho:</span> {formatFileSize(backup.size)}
                  </div>
                  <div>
                    <span className="font-medium">Criado:</span> {format(new Date(backup.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </div>
                  {backup.completed_at && (
                    <div>
                      <span className="font-medium">Concluído:</span> {format(new Date(backup.completed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Tabelas:</span> {backup.tables_included.length}
                  </div>
                </div>
                
                {backup.status === 'running' && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>Progresso</span>
                      <span>65%</span>
                    </div>
                    <Progress value={65} className="h-2" />
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2 ml-4">
                {backup.status === 'completed' && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleDownload(backup)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleRestore(backup)}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Restaurar
                    </Button>
                  </>
                )}
                {backup.status === 'running' && (
                  <Button variant="outline" size="sm">
                    <Pause className="h-4 w-4 mr-2" />
                    Pausar
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const CreateBackup = () => {
  const [backupType, setBackupType] = useState<'full' | 'incremental'>('incremental');
  const [selectedTables, setSelectedTables] = useState<string[]>(['messages', 'contacts']);
  const [backupName, setBackupName] = useState('');
  const [description, setDescription] = useState('');
  const { toast } = useToast();

  const availableTables = [
    'contacts',
    'messages', 
    'campaigns',
    'chatbots',
    'automation_flows',
    'funnel_stages',
    'followups',
    'notifications'
  ];

  const handleCreateBackup = () => {
    if (!backupName.trim()) {
      toast({
        title: "Erro",
        description: "Nome do backup é obrigatório",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Backup iniciado",
      description: `Criando backup: ${backupName}`
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar Novo Backup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="backupName">Nome do Backup</Label>
              <Input
                id="backupName"
                value={backupName}
                onChange={(e) => setBackupName(e.target.value)}
                placeholder="Ex: Backup Manual - Janeiro 2025"
              />
            </div>
            
            <div>
              <Label htmlFor="backupType">Tipo de Backup</Label>
              <Select value={backupType} onValueChange={(value: 'full' | 'incremental') => setBackupType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Completo (todos os dados)</SelectItem>
                  <SelectItem value="incremental">Incremental (apenas alterações)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o propósito deste backup..."
                rows={3}
              />
            </div>
          </div>
          
          <div>
            <Label>Tabelas a Incluir</Label>
            <div className="space-y-2 mt-2 max-h-48 overflow-y-auto border rounded-md p-3">
              {availableTables.map((table) => (
                <div key={table} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={table}
                    checked={selectedTables.includes(table)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTables([...selectedTables, table]);
                      } else {
                        setSelectedTables(selectedTables.filter(t => t !== table));
                      }
                    }}
                    className="rounded"
                  />
                  <Label htmlFor={table} className="text-sm capitalize">
                    {table.replace('_', ' ')}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleCreateBackup}>
            <Database className="h-4 w-4 mr-2" />
            Criar Backup
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const ScheduleManager = () => {
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleToggleSchedule = (schedule: BackupSchedule) => {
    toast({
      title: schedule.is_active ? "Agendamento desativado" : "Agendamento ativado",
      description: `${schedule.name} foi ${schedule.is_active ? 'desativado' : 'ativado'}`
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Agendamentos Automáticos</h3>
        <Button onClick={() => setIsCreating(true)}>
          <Calendar className="h-4 w-4 mr-2" />
          Novo Agendamento
        </Button>
      </div>
      
      <div className="space-y-4">
        {mockSchedules.map((schedule) => (
          <Card key={schedule.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h4 className="font-semibold">{schedule.name}</h4>
                    <Badge variant={schedule.is_active ? "default" : "secondary"}>
                      {schedule.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Badge variant="outline">
                      {schedule.frequency === 'daily' ? 'Diário' : schedule.frequency === 'weekly' ? 'Semanal' : 'Mensal'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">Horário:</span> {schedule.time}
                    </div>
                    <div>
                      <span className="font-medium">Tipo:</span> {schedule.type === 'full' ? 'Completo' : 'Incremental'}
                    </div>
                    <div>
                      <span className="font-medium">Retenção:</span> {schedule.retention_days} dias
                    </div>
                    <div>
                      <span className="font-medium">Próxima execução:</span> {formatDistanceToNow(new Date(schedule.next_run), { locale: ptBR, addSuffix: true })}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  <Switch
                    checked={schedule.is_active}
                    onCheckedChange={() => handleToggleSchedule(schedule)}
                  />
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

const RestoreManager = () => {
  const [selectedBackup, setSelectedBackup] = useState<string>('');
  const [restoreOptions, setRestoreOptions] = useState({
    overwriteExisting: false,
    createBackupBeforeRestore: true,
    selectedTables: [] as string[]
  });
  const { toast } = useToast();

  const handleRestore = () => {
    if (!selectedBackup) {
      toast({
        title: "Erro",
        description: "Selecione um backup para restaurar",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Restauração iniciada",
      description: "O processo de restauração foi iniciado. Isso pode levar alguns minutos.",
      variant: "destructive"
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <RotateCcw className="h-5 w-5" />
          <span>Restaurar Dados</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Atenção:</strong> A restauração de dados pode sobrescrever informações existentes. 
            Recomendamos criar um backup antes de prosseguir.
          </AlertDescription>
        </Alert>
        
        <div>
          <Label htmlFor="backupSelect">Selecionar Backup</Label>
          <Select value={selectedBackup} onValueChange={setSelectedBackup}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um backup para restaurar" />
            </SelectTrigger>
            <SelectContent>
              {mockBackups.filter(b => b.status === 'completed').map((backup) => (
                <SelectItem key={backup.id} value={backup.id}>
                  {backup.name} - {format(new Date(backup.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="createBackup"
              checked={restoreOptions.createBackupBeforeRestore}
              onChange={(e) => setRestoreOptions(prev => ({ ...prev, createBackupBeforeRestore: e.target.checked }))}
              className="rounded"
            />
            <Label htmlFor="createBackup">Criar backup antes da restauração</Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="overwrite"
              checked={restoreOptions.overwriteExisting}
              onChange={(e) => setRestoreOptions(prev => ({ ...prev, overwriteExisting: e.target.checked }))}
              className="rounded"
            />
            <Label htmlFor="overwrite">Sobrescrever dados existentes</Label>
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleRestore} variant="destructive">
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar Dados
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export const BackupManager = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gerenciamento de Backup</h2>
          <p className="text-muted-foreground">
            Gerencie backups, agendamentos e restauração de dados
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge className="bg-green-50 text-green-700 border-green-200">
            <HardDrive className="h-3 w-3 mr-1" />
            Espaço: 45.2 GB disponível
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="backups" className="space-y-6">
        <TabsList>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="create">Criar Backup</TabsTrigger>
          <TabsTrigger value="schedule">Agendamentos</TabsTrigger>
          <TabsTrigger value="restore">Restaurar</TabsTrigger>
        </TabsList>

        <TabsContent value="backups" className="space-y-6">
          <BackupList />
        </TabsContent>

        <TabsContent value="create" className="space-y-6">
          <CreateBackup />
        </TabsContent>

        <TabsContent value="schedule" className="space-y-6">
          <ScheduleManager />
        </TabsContent>

        <TabsContent value="restore" className="space-y-6">
          <RestoreManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};