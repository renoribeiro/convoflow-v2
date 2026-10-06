import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bug, CheckCircle2, Film, Loader2, Upload, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { AnyUserRole, roleLabel } from '@/types/userHierarchy';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

const BUCKET = 'bug-reports';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — igual ao file_size_limit do bucket
const MIN_DESCRIPTION = 20;
/** Bucket é privado: o link vai por e-mail e precisa sobreviver à triagem. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 ano

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Botão "Reportar bug" da Navbar (à esquerda do sino de notificações).
 *
 * Fluxo de envio, nesta ordem:
 *   1. sobe o anexo (se houver) em bug-reports/<tenant>/<user>/<ts>-<arquivo>
 *   2. gera URL assinada (bucket privado)
 *   3. grava a linha em bug_reports
 *   4. dispara o e-mail pela Edge Function send-report (kind='bug_report')
 *
 * Rollback: falha em 1–3 remove o anexo já subido e mostra erro inline. O passo
 * 4 é best-effort DEPOIS do commit — ver comentário no próprio bloco.
 *
 * Casts para `any`: `bug_reports` e `tenants.bug_report_enabled` são das
 * migrações 20260810000001/3 e ainda não estão em `types.ts` (mesmo padrão já
 * usado com `profiles.capabilities` no TenantContext).
 */
export const BugReportButton: React.FC = () => {
  const { tenant, tenantId, profile } = useTenant();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Troca o conteúdo do dialog pela tela de agradecimento após o envio. */
  const [submitted, setSubmitted] = useState(false);

  // Feature flag por Conta. Primeiro segmento 'tenant' cai no tier estático
  // (30 min) do createQueryClient.
  const { data: featureEnabled = true } = useQuery({
    queryKey: ['tenant', 'bug-report-enabled', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<boolean> => {
      const { data, error: queryError } = await (supabase.from('tenants') as any)
        .select('bug_report_enabled')
        .eq('id', tenantId)
        .maybeSingle();

      // Migração 20260810000003 ainda não aplicada → coluna inexistente.
      // Degrada ABERTO (o default da coluna é true) em vez de sumir com o botão.
      if (queryError) {
        logger.warn('[BugReportButton] Falha ao ler bug_report_enabled', {
          error: queryError.message,
        });
        return true;
      }
      return (data as { bug_report_enabled?: boolean } | null)?.bug_report_enabled ?? true;
    },
  });

  // Preview só faz sentido para imagem; vídeo mostra o nome do arquivo.
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selectFile = useCallback((candidate: File) => {
    const isImage = candidate.type.startsWith('image/');
    const isVideo = candidate.type.startsWith('video/');

    if (!isImage && !isVideo) {
      setError('Formato não suportado. Envie uma imagem ou um vídeo.');
      return;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setError(`O arquivo é maior que o limite de 50 MB (${formatBytes(candidate.size)}).`);
      return;
    }
    setError(null);
    setFile(candidate);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const resetForm = useCallback(() => {
    setDescription('');
    setFile(null);
    setError(null);
    setIsDragging(false);
    setSubmitted(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (isSubmitting) return; // não fecha no meio do envio
      setOpen(next);
      if (!next) resetForm();
    },
    [isSubmitting, resetForm],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = description.trim();

    if (trimmed.length < MIN_DESCRIPTION) {
      setError(`A descrição precisa ter pelo menos ${MIN_DESCRIPTION} caracteres.`);
      return;
    }
    if (!tenantId || !user) {
      setError('Não foi possível identificar sua Conta. Recarregue a página e tente novamente.');
      return;
    }
    const userEmail = user.email ?? '';
    if (!userEmail) {
      setError('Não foi possível identificar seu e-mail. Recarregue a página e tente novamente.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let uploadedPath: string | null = null;

    try {
      let attachmentUrl: string | null = null;
      let attachmentType: 'image' | 'video' | null = null;

      // 1) Upload do anexo
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${tenantId}/${user.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
        if (uploadError) {
          throw new Error(`Falha ao enviar o anexo: ${uploadError.message}`);
        }
        uploadedPath = path;

        // 2) URL assinada (bucket privado)
        const { data: signed, error: signError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (signError || !signed?.signedUrl) {
          throw new Error('Falha ao gerar o link do anexo. Tente novamente.');
        }
        attachmentUrl = signed.signedUrl;
        attachmentType = file.type.startsWith('video/') ? 'video' : 'image';
      }

      const pageUrl = window.location.href;
      const userRoleLabel = roleLabel(profile?.role as AnyUserRole | undefined);
      // Loja = linha de tenants com kind='store' (hierarquia V2).
      const storeId = (tenant as any)?.kind === 'store' ? tenant?.id ?? null : null;

      // 3) Persistência. Sem .select(): a policy de SELECT é exclusiva do
      // superadmin, então pedir a linha de volta faria o insert parecer falho.
      const { error: insertError } = await (supabase as any).from('bug_reports').insert({
        tenant_id: tenantId,
        store_id: storeId,
        user_id: user.id,
        user_email: userEmail,
        user_role: userRoleLabel,
        description: trimmed,
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
        page_url: pageUrl,
      });
      if (insertError) {
        throw new Error(`Falha ao registrar o relato: ${insertError.message}`);
      }

      // 4) Notificação por e-mail — best-effort e DEPOIS do commit.
      // O relato já está gravado e não há policy de DELETE para desfazê-lo, então
      // derrubar o envio (e apagar o anexo do usuário) porque o Resend falhou
      // destruiria um registro válido. Falha aqui vira warning, não erro de UI.
      try {
        const { error: fnError } = await supabase.functions.invoke('send-report', {
          body: {
            kind: 'bug_report',
            description: trimmed,
            attachment_url: attachmentUrl,
            attachment_type: attachmentType,
            page_url: pageUrl,
            user_email: userEmail,
            user_role: userRoleLabel,
            tenant_id: tenantId,
            store_id: storeId,
            tenant_name: tenant?.name ?? null,
          },
        });
        if (fnError) throw fnError;
      } catch (notifyError) {
        logger.warn('[BugReportButton] Relato gravado, mas o e-mail falhou', {
          error: (notifyError as Error)?.message,
        });
      }

      // Agradecimento no próprio dialog (não em toast de canto de tela).
      setSubmitted(true);
    } catch (err) {
      // Rollback do anexo: sem isso, o arquivo fica órfão no bucket.
      if (uploadedPath) {
        try {
          await supabase.storage.from(BUCKET).remove([uploadedPath]);
        } catch (cleanupError) {
          logger.error('[BugReportButton] Falha ao remover anexo órfão', {
            path: uploadedPath,
            error: (cleanupError as Error)?.message,
          });
        }
      }
      const message =
        (err as Error)?.message || 'Não foi possível enviar seu relato. Tente novamente.';
      setError(message);
      logger.error('[BugReportButton] Falha ao enviar relato', { error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [description, tenantId, user, file, profile, tenant]);

  // Sem Conta ativa não há como atribuir o relato (tenant_id é NOT NULL).
  if (!featureEnabled || !tenantId) return null;

  const charCount = description.trim().length;

  return (
    <>
      {/* Destacado de propósito: vermelho + texto branco em negrito. Só o ícone
          passava despercebido no meio dos controles ghost da Navbar. */}
      <Button
        variant="destructive"
        onClick={() => setOpen(true)}
        className="h-8 gap-1.5 px-2.5 text-xs font-bold shadow-sm"
        title="Reportar bug"
        aria-label="Reportar bug"
      >
        <Bug className="h-4 w-4" />
        {/* Abaixo de lg só o ícone: o vermelho continua chamando atenção e a
            Navbar não tem largura para o texto no tablet e no celular. */}
        <span className="hidden lg:inline">Reportar bug</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
          {submitted ? (
          <motion.div
            key="thanks"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-4 py-4 text-center"
          >
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 260, damping: 18 }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20"
            >
              <CheckCircle2 className="h-9 w-9 text-primary" />
            </motion.div>

            <DialogHeader className="space-y-2 sm:text-center">
              <DialogTitle className="text-xl">Obrigado pelo seu relato!</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Seu feedback é muito importante para nós. Cada problema que você aponta ajuda a
                deixar o ConvoFlow melhor para você e para todo mundo que usa a plataforma.
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
              Nossa equipe já foi avisada e vai analisar o que você enviou.
            </p>

            <Button onClick={() => handleOpenChange(false)} className="w-full">
              Fechar
            </Button>
          </motion.div>
          ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>Relatar um problema</DialogTitle>
              <DialogDescription>
                Descreva o que aconteceu e, se possível, anexe uma imagem ou vídeo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isSubmitting}
                rows={5}
                placeholder="Descreva o problema com o máximo de detalhes possível..."
                aria-label="Descrição do problema"
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {charCount < MIN_DESCRIPTION
                  ? `Mínimo de ${MIN_DESCRIPTION} caracteres (${charCount}/${MIN_DESCRIPTION}).`
                  : `${charCount} caracteres.`}
              </p>
            </div>

            {/* Área de anexo: arraste e solte ou clique para escolher */}
            <AnimatePresence mode="wait" initial={false}>
              {file ? (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3"
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={`Pré-visualização de ${file.name}`}
                      className="h-14 w-14 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted">
                      <Film className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearFile}
                    disabled={isSubmitting}
                    className="h-8 w-8 shrink-0"
                    aria-label="Remover anexo"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const dropped = e.dataTransfer.files?.[0];
                      if (dropped) selectFile(dropped);
                    }}
                    disabled={isSubmitting}
                    className={cn(
                      'flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      isDragging
                        ? 'border-primary bg-primary/10'
                        : 'border-input hover:border-primary/60 hover:bg-muted/40',
                    )}
                  >
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Arraste um arquivo aqui ou{' '}
                      <span className="font-medium text-foreground">clique para escolher</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Imagem ou vídeo, até 50 MB
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) selectFile(chosen);
              }}
            />

            <AnimatePresence initial={false}>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  role="alert"
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar Relato'
              )}
            </Button>
          </motion.div>
          )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BugReportButton;
