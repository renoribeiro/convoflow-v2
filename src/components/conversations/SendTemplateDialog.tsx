import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TemplateStatusBadge } from '@/components/shared/TemplateStatusBadge';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import type { IWhatsAppProvider, WhatsAppTemplate } from '@/services/whatsapp';

interface SendTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Adapter da instância ativa (deve ser Meta/official). */
  adapter: IWhatsAppProvider;
  /** Telefone do destinatário (formato aceito pelo adapter). */
  toPhone: string;
  /**
   * Chamado após envio bem-sucedido para persistir a linha na thread. Recebe um
   * resumo textual do que foi enviado (ex.: "Template: pedido_confirmado").
   */
  onSent: (summary: string) => Promise<void> | void;
}

const LANGUAGE_LABELS: Record<string, string> = {
  pt_BR: 'Português (Brasil)',
  en_US: 'English (US)',
  es: 'Español',
};

/** Chave composta name::language (o mesmo nome pode ter várias línguas). */
const keyOf = (t: { name: string; language: string }) => `${t.name}::${t.language}`;

/** APROVADO primeiro; depois ordem alfabética. */
function sortTemplates(list: WhatsAppTemplate[]): WhatsAppTemplate[] {
  const rank = (s?: string) => (String(s).toUpperCase() === 'APPROVED' ? 0 : 1);
  return [...list].sort(
    (a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name),
  );
}

/**
 * Envia um template aprovado (HSM) direto da conversa — o caminho para reabrir
 * o atendimento fora da janela de 24h da Meta.
 *
 * Busca os templates da instância via adapter.listTemplates() e oferece um
 * seletor. Se a busca falhar (ou o provider não suportar), cai para digitação
 * manual do nome (SKILL §7.1 / §2.12).
 */
export function SendTemplateDialog({
  open,
  onOpenChange,
  adapter,
  toPhone,
  onSent,
}: SendTemplateDialogProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const [selectedKey, setSelectedKey] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const sorted = useMemo(() => sortTemplates(templates), [templates]);
  const selectedTemplate = useMemo(
    () => templates.find((t) => keyOf(t) === selectedKey) || null,
    [templates, selectedKey],
  );

  const resetForm = () => {
    setSelectedKey('');
    setTemplateName('');
    setLanguage('pt_BR');
    setParams([]);
    setManualMode(false);
  };

  const fetchTemplates = async () => {
    if (typeof adapter.listTemplates !== 'function') {
      setManualMode(true);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const list = await adapter.listTemplates();
      setTemplates(list);
      if (list.length === 0) {
        setLoadError('Nenhum template encontrado nesta conta Meta.');
        setManualMode(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn('[SendTemplateDialog] falha ao listar templates', { error: msg });
      setLoadError(msg);
      setManualMode(true);
    } finally {
      setLoading(false);
    }
  };

  // Busca ao abrir; limpa ao fechar.
  useEffect(() => {
    if (open) {
      resetForm();
      setTemplates([]);
      fetchTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (sending) return;
    onOpenChange(next);
  };

  const handleSelectTemplate = (key: string) => {
    setSelectedKey(key);
    const t = templates.find((x) => keyOf(x) === key);
    if (t) {
      setTemplateName(t.name);
      setLanguage(t.language);
      setParams(Array.from({ length: t.paramCount ?? 0 }, () => ''));
    }
  };

  const handleSubmit = async () => {
    const name = templateName.trim();
    if (!name) {
      toast.error('Selecione ou informe o nome do template.');
      return;
    }
    if (typeof adapter.sendTemplate !== 'function') {
      toast.error('Este provider não suporta envio de template.');
      return;
    }

    setSending(true);
    try {
      const res = await adapter.sendTemplate(toPhone, {
        templateName: name,
        language,
        bodyParams: params.map((p) => p.trim()).filter((p) => p.length > 0),
      });

      if (res.status !== 'sent' && res.status !== 'pending') {
        toast.error(`Template não enviado: ${res.error || 'Erro desconhecido.'}`);
        return;
      }

      await onSent(`Template: ${name}`);
      toast.success('Template enviado.');
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[SendTemplateDialog] falha ao enviar template', { error: msg });
      toast.error(`Falha ao enviar template: ${msg}`);
    } finally {
      setSending(false);
    }
  };

  const canSubmit = !sending && !!templateName.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Enviar template aprovado
            <FeatureHelp helpKey="page:conversations-template" />
          </DialogTitle>
          <DialogDescription>
            Fora da janela de 24h, a Meta só permite reabrir a conversa com um template já aprovado no
            Gerenciador do WhatsApp Business.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Modo lista (padrão): seletor com os templates da conta */}
          {!manualMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-select">Template</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 disabled:opacity-50"
                  onClick={fetchTemplates}
                  disabled={loading || sending}
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>
              </div>
              <Select
                value={selectedKey}
                onValueChange={handleSelectTemplate}
                disabled={loading || sending}
              >
                <SelectTrigger id="tpl-select">
                  <SelectValue placeholder={loading ? 'Carregando templates...' : 'Escolha um template'} />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((t) => (
                    <SelectItem key={keyOf(t)} value={keyOf(t)}>
                      <span className="flex items-center gap-2">
                        <span>{t.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {LANGUAGE_LABELS[t.language] || t.language}
                        </span>
                        <TemplateStatusBadge status={t.status} />
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && String(selectedTemplate.status).toUpperCase() !== 'APPROVED' && (
                <p className="text-xs text-warning">
                  Este template não está APROVADO. A Meta provavelmente vai recusar o envio.
                </p>
              )}
              {selectedTemplate?.bodyText && (
                <p className="text-xs text-muted-foreground border rounded p-2 bg-muted/30 whitespace-pre-wrap">
                  {selectedTemplate.bodyText}
                </p>
              )}
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
                onClick={() => setManualMode(true)}
                disabled={sending}
              >
                Digitar o nome manualmente
              </button>
            </div>
          )}

          {/* Modo manual: nome + idioma digitados (fallback) */}
          {manualMode && (
            <>
              {loadError && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Não consegui carregar a lista de templates ({loadError}). Digite o nome manualmente.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tpl-name">Nome do template *</Label>
                  {templates.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
                      onClick={() => setManualMode(false)}
                      disabled={sending}
                    >
                      Escolher da lista
                    </button>
                  )}
                </div>
                <Input
                  id="tpl-name"
                  placeholder="Ex: pedido_confirmado"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  disabled={sending}
                />
                <p className="text-xs text-muted-foreground">
                  Use o nome exato (status <strong>APROVADO</strong>) do Gerenciador do WhatsApp Business.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tpl-language">Idioma do template</Label>
                <Select value={language} onValueChange={setLanguage} disabled={sending}>
                  <SelectTrigger id="tpl-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                    <SelectItem value="en_US">English (US)</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Parâmetros do corpo — comuns aos dois modos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Parâmetros do corpo</Label>
              {manualMode && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                  onClick={() => setParams((prev) => [...prev, ''])}
                  disabled={sending}
                >
                  + Adicionar parâmetro
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Valores para {'{{1}}'}, {'{{2}}'}, etc., na ordem em que aparecem no template.
            </p>
            {params.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                {manualMode ? 'Nenhum parâmetro adicionado.' : 'Este template não tem parâmetros.'}
              </p>
            )}
            {params.map((param, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <span className="text-xs text-muted-foreground w-8 shrink-0">{`{{${idx + 1}}}`}</span>
                <Input
                  value={param}
                  placeholder={`Valor de {{${idx + 1}}}`}
                  onChange={(e) => {
                    setParams((prev) => {
                      const updated = [...prev];
                      updated[idx] = e.target.value;
                      return updated;
                    });
                  }}
                  disabled={sending}
                />
                {manualMode && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    onClick={() => setParams((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={sending}
                    aria-label="Remover parâmetro"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {sending ? 'Enviando...' : 'Enviar template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SendTemplateDialog;
