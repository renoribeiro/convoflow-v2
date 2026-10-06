import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { useSupabaseQuery } from './useSupabaseQuery';

// Sem fallback para dados mockados, de propósito.
//
// Até 2026-08-19 estes hooks devolviam agendamentos e templates inventados
// sempre que a consulta falhava ou a Conta ainda não tinha carregado. O efeito
// prático era o pior possível: a tela mostrava agendamento que não existia no
// banco, o usuário acreditava que o relatório seria enviado, e não era. Agora o
// erro sobe para a tela e a lista vazia é vazia de verdade.
const CONTA_NAO_CARREGADA = 'Conta não carregada. Recarregue a página e tente de novo.';

// Interfaces para tipos de dados
export interface ReportTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  category?: string;
  type: 'chart' | 'table' | 'metric' | 'dashboard';
  config: any;
  is_public: boolean;
  created_by?: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReportData {
  id: string;
  tenant_id: string;
  template_id?: string;
  name: string;
  data: any;
  metadata?: any;
  generated_at: string;
  expires_at?: string;
}

export interface MetricsCache {
  id: string;
  tenant_id: string;
  metric_key: string;
  metric_value: any;
  time_range?: string;
  cached_at: string;
  expires_at?: string;
}

export interface ReportSchedule {
  id: string;
  tenant_id: string;
  // Agendamento não depende de report_templates: o relatório é montado pelo
  // tipo/período gravados em `parameters`. A coluna é uuid NULLABLE no banco.
  template_id: string | null;
  name: string;
  description?: string;
  cron_expression: string;
  recipients: string[];
  parameters?: any;
  is_active: boolean;
  last_run?: string;
  next_run?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ReportExecution {
  id: string;
  tenant_id: string;
  template_id: string;
  schedule_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  execution_time?: number;
  error_message?: string;
  output_data?: any;
  created_at: string;
}

// Hook para buscar templates de relatórios
export function useReportTemplates(options?: {
  category?: string;
  type?: string;
  includePublic?: boolean;
}) {
  const { tenant, loading: tenantLoading } = useTenant();
  
  return useQuery({
    queryKey: ['report-templates', options, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error(CONTA_NAO_CARREGADA);

      let query = supabase
        .from('report_templates')
        .select('*');

      // Aplicar filtros
      if (options?.includePublic) {
        query = query.or(`tenant_id.eq.${tenant.id},is_public.eq.true`);
      } else {
        query = query.eq('tenant_id', tenant.id);
      }

      if (options?.category) {
        query = query.eq('category', options.category);
      }

      if (options?.type) {
        query = query.eq('type', options.type);
      }

      const { data, error } = await query.order('usage_count', { ascending: false });

      // O erro sobe: template que não carregou não pode virar template inventado.
      if (error) throw error;

      return data || [];
    },
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 5 * 60 * 1000,
  });
}

// Hook para buscar um template específico
export function useReportTemplate(id: string) {
  return useSupabaseQuery({
    table: 'report_templates',
    queryKey: ['report-template', id],
    select: '*',
    filters: [{ column: 'id', operator: 'eq', value: id }],
    enabled: !!id,
  });
}

// Hook para gerar relatório
export function useGenerateReport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ templateId, config }: { templateId: string; config: any }) => {
      const { data, error } = await supabase
        .from('report_executions')
        .insert({
          template_id: templateId,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Relatório gerado',
        description: 'O relatório foi gerado com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-executions'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao gerar relatório',
        description: 'Ocorreu um erro ao gerar o relatório.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para deletar template
export function useDeleteReportTemplate() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('report_templates')
        .delete()
        .eq('id', templateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Template excluído',
        description: 'O template foi excluído com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-templates'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir template',
        description: 'Ocorreu um erro ao excluir o template.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para criar template de relatório
export function useCreateReportTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (templateData: Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'created_by'>) => {
      if (!tenant?.id) throw new Error(CONTA_NAO_CARREGADA);

      const { data, error } = await supabase
        .from('report_templates')
        .insert({
          ...templateData,
          tenant_id: tenant.id,
          usage_count: 0
        })
        .select()
        .single();

      // Sem fallback: template "criado" só na memória sumia no reload.
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-templates'] });
      toast({
        title: 'Sucesso',
        description: 'Template de relatório criado com sucesso',
      });
    },
    onError: (error) => {
      console.error('Erro ao criar template:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao criar template de relatório',
        variant: 'destructive',
      });
    },
  });
}

// Hook para buscar agendamentos
export function useReportSchedules(templateId?: string) {
  const { tenant } = useTenant();
  
  return useQuery({
    queryKey: ['report-schedules', templateId, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error(CONTA_NAO_CARREGADA);

      let query = supabase
        .from('report_schedules')
        .select('*, report_templates(name, type)')
        .eq('tenant_id', tenant.id);

      if (templateId) {
        query = query.eq('template_id', templateId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      // O erro sobe para a tela (ScheduleList já tem o alerta). Mostrar
      // agendamento inventado aqui fazia o usuário confiar num envio que
      // nunca ia acontecer.
      if (error) throw error;

      return data || [];
    },
    enabled: !!tenant?.id,
  });
}

// Hook para criar agendamento
export function useCreateReportSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  
  return useMutation({
    mutationFn: async (scheduleData: Partial<ReportSchedule>) => {
      if (!tenant?.id) throw new Error(CONTA_NAO_CARREGADA);

      const { data, error } = await supabase
        .from('report_schedules')
        .insert({
          ...scheduleData,
          tenant_id: tenant.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Agendamento criado',
        description: 'O agendamento foi criado com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar agendamento',
        description: 'Ocorreu um erro ao criar o agendamento.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para atualizar agendamento
export function useUpdateReportSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ReportSchedule> & { id: string }) => {
      if (!tenant?.id) throw new Error(CONTA_NAO_CARREGADA);

      const { data, error } = await supabase
        .from('report_schedules')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Agendamento atualizado',
        description: 'O agendamento foi atualizado com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar agendamento',
        description: 'Ocorreu um erro ao atualizar o agendamento.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para deletar agendamento
export function useDeleteReportSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  
  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenant?.id) throw new Error(CONTA_NAO_CARREGADA);

      const { error } = await supabase
        .from('report_schedules')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Agendamento excluído',
        description: 'O agendamento foi excluído com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir agendamento',
        description: 'Ocorreu um erro ao excluir o agendamento.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para alternar status de agendamento
export function useToggleReportSchedule() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!tenant?.id) throw new Error(CONTA_NAO_CARREGADA);

      const { data, error } = await supabase
        .from('report_schedules')
        .update({ 
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();

      if (error) {
        console.error('Erro ao atualizar status do agendamento:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
      toast({
        title: "Sucesso",
        description: `Agendamento ${data.is_active ? 'ativado' : 'desativado'} com sucesso.`,
      });
    },
    onError: (error) => {
      console.error('Erro ao alterar status do agendamento:', error);
      toast({
        title: "Erro",
        description: "Erro ao alterar status do agendamento.",
        variant: "destructive",
      });
    },
  });
}

// Hook para buscar execuções
export function useReportExecutions(templateId?: string) {
  const { tenant } = useTenant();
  
  return useQuery({
    queryKey: ['report-executions', templateId, tenant?.id],
    queryFn: async () => {
      // Sem tenant resolvido ainda: histórico vazio (nunca dados mock para um
      // usuário logado — isso mostrava execuções falsas de demonstração).
      if (!tenant?.id) {
        return [];
      }

      try {
        let query = supabase
          .from('report_executions')
          .select('*, report_templates(name, type)')
          .eq('tenant_id', tenant.id);

        if (templateId) {
          query = query.eq('template_id', templateId);
        }

        // A coluna correta é executed_at (não existe created_at nesta tabela).
        const { data, error } = await query.order('executed_at', { ascending: false });

        if (error) {
          console.warn('Erro ao buscar execuções:', error);
          return [];
        }

        return data || [];
      } catch (error) {
        console.warn('Erro na consulta de execuções:', error);
        return [];
      }
    },
    enabled: !!tenant?.id,
  });
}