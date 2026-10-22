/**
 * "Novo Lead" do Funil: nome, telefone e etapa. Grava de verdade, pela regra
 * de src/lib/funnel/novoLead.ts — telefone que já é contato da Loja não
 * duplica: o card dele vai para a etapa escolhida.
 *
 * Aberto pelo botão "Novo Lead" do topo e por "Adicionar Lead" no menu de cada
 * coluna (que já chega com a etapa da coluna escolhida). Vale para todo cargo
 * da Loja, atendente incluído: cadastrar lead e mover card é operação.
 *
 * Sem etapa (ou o Gerente com a Conta em foco), a janela mostra o
 * EstadoVazioFunil do caso, e "Criar lead" fica desabilitado: ninguém
 * preenche o formulário à toa.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { EstadoVazioFunil } from '@/components/funnel/EstadoVazioFunil';
import { situacaoDoFunil } from '@/lib/funnel/estadoVazio';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  NovoLeadErro,
  salvarNovoLead,
  validarNovoLead,
  type ErrosNovoLead,
  type ResultadoNovoLead,
} from '@/lib/funnel/novoLead';

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Etapa já escolhida ("Adicionar Lead" no menu da coluna). */
  etapaInicialId?: string | null;
  /** "Criar etapas agora" no funil vazio: abre "Configurar Estágios". */
  onConfigurarEtapas?: () => void;
}

interface Etapa {
  id: string;
  name: string;
  order: number | null;
}

export const NewLeadModal = ({ isOpen, onClose, etapaInicialId, onConfigurarEtapas }: NewLeadModalProps) => {
  const { tenantId, tenant } = useTenant();
  const role = useRole();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [etapaId, setEtapaId] = useState('');
  const [erros, setErros] = useState<ErrosNovoLead>({});

  const { data: etapasData = [], isLoading: carregandoEtapas } = useSupabaseQuery({
    table: 'funnel_stages',
    select: 'id, name, order',
    orderBy: [{ column: 'order', ascending: true }],
    enabled: isOpen,
  });
  // useSupabaseQuery tipa o select de texto livre como GenericStringError[].
  const etapas = etapasData as unknown as Etapa[];

  // Abriu: etapa da coluna, se veio de uma...
  useEffect(() => {
    if (isOpen && etapaInicialId) setEtapaId(etapaInicialId);
  }, [isOpen, etapaInicialId]);

  // ...senão, a primeira do funil (sem atropelar a escolha da pessoa).
  useEffect(() => {
    if (isOpen && !etapaId && !etapaInicialId && etapas[0]) setEtapaId(etapas[0].id);
  }, [isOpen, etapaId, etapaInicialId, etapas]);

  const limpar = () => {
    setNome('');
    setTelefone('');
    setEtapaId('');
    setErros({});
  };

  const salvar = useMutation({
    mutationFn: () => {
      if (!tenantId) throw new NovoLeadErro('Conta não carregada. Tente de novo.');
      return salvarNovoLead(supabase, { tenantId, nome, telefone, etapaId });
    },
    onSuccess: (r: ResultadoNovoLead) => {
      const etapa = etapas.find((e) => e.id === etapaId)?.name ?? 'a etapa escolhida';
      if (r.tipo === 'criado') {
        toast.success(`Lead ${r.nome} criado em ${etapa}.`);
      } else {
        toast.success(`Esse telefone já é de ${r.nome}. O card foi para ${etapa}, sem duplicar o contato.`);
      }
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      limpar();
      onClose();
    },
    onError: (error: unknown) => {
      logger.warn('[NewLeadModal] lead não gravado', { error });
      toast.error(error instanceof NovoLeadErro ? error.message : 'Não deu para criar o lead. Tente de novo.');
    },
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const encontrados = validarNovoLead({ nome, telefone, etapaId });
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    salvar.mutate();
  };

  const fechar = () => {
    if (salvar.isPending) return;
    limpar();
    onClose();
  };

  const situacao = situacaoDoFunil({
    role,
    emConta: (tenant as { kind?: string | null } | null)?.kind === 'account',
    temEtapas: etapas.length > 0,
  });
  const pronto = situacao === 'pronto';
  const aguardando = carregandoEtapas && situacao !== 'conta';

  return (
    <Dialog open={isOpen} onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" aria-hidden="true" />
            Novo Lead
          </DialogTitle>
          <DialogDescription>
            O lead entra nos Contatos e já aparece na etapa escolhida. Telefone que já é contato da Loja não é
            duplicado: o card dele vai para a etapa.
          </DialogDescription>
        </DialogHeader>

        {aguardando ? (
          <p className="text-sm text-muted-foreground">Carregando as etapas...</p>
        ) : !pronto ? (
          <EstadoVazioFunil
            situacao={situacao}
            acaoDepoisDaLoja="novo-lead"
            onConfigurarEtapas={onConfigurarEtapas}
          />
        ) : (
          <form id="novo-lead" onSubmit={enviar} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="novo-lead-nome">Nome *</Label>
              <Input
                id="novo-lead-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do cliente"
                disabled={salvar.isPending}
                aria-invalid={!!erros.nome}
              />
              {erros.nome && <p className="text-sm text-destructive">{erros.nome}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="novo-lead-telefone">Telefone *</Label>
              <Input
                id="novo-lead-telefone"
                type="tel"
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(11) 99999-9999"
                disabled={salvar.isPending}
                aria-invalid={!!erros.telefone}
              />
              {erros.telefone && <p className="text-sm text-destructive">{erros.telefone}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="novo-lead-etapa">Etapa *</Label>
              <Select value={etapaId} onValueChange={setEtapaId} disabled={salvar.isPending || carregandoEtapas}>
                <SelectTrigger id="novo-lead-etapa" aria-invalid={!!erros.etapa}>
                  <SelectValue placeholder="Escolha a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((etapa) => (
                    <SelectItem key={etapa.id} value={etapa.id}>
                      {etapa.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {erros.etapa && <p className="text-sm text-destructive">{erros.etapa}</p>}
            </div>
          </form>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button variant="outline" onClick={fechar} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="novo-lead" disabled={salvar.isPending || !pronto || aguardando}>
            {salvar.isPending ? 'Criando...' : 'Criar lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewLeadModal;
