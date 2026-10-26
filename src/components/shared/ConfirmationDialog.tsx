import React, { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';

/**
 * A confirmação do sistema: toda ação que apaga, desconecta, suspende, revoga,
 * envia em massa ou cobra passa por aqui (lote 2 do checkup de usabilidade,
 * 2026-10-26). Uma janela só, com as mesmas regras em todo lugar:
 *
 *  - o texto diz o que vai acontecer e com o quê (nome, número, quantidade,
 *    preço) e se dá para desfazer (`reversivel`);
 *  - o botão de confirmar diz a ação ("Desconectar número", "Disparar para
 *    1.240 contatos"), nunca só "Confirmar";
 *  - o foco começa em Cancelar (padrão do AlertDialog do Radix): Enter sem
 *    pensar não confirma nada;
 *  - nas mais destrutivas, `textoParaDigitar` exige digitar o nome antes;
 *  - enquanto a ação roda a janela não fecha, e só fecha quando ela termina
 *    bem. Se der erro, quem chamou mostra o aviso e a janela continua aberta.
 */
interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  /** O que vai acontecer, com os nomes e números. Pode ter mais de um parágrafo. */
  description: React.ReactNode;
  /** Rótulo do botão de confirmar: a ação, com o objeto. */
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
  icon?: React.ReactNode;
  /**
   * true: diz que dá para desfazer (e como, em `comoDesfazer`); false: diz que
   * não dá. Ausente: a descrição já cobre isso.
   */
  reversivel?: boolean;
  comoDesfazer?: string;
  /** Texto que a pessoa precisa digitar igual para liberar o botão (ex.: o nome da Conta). */
  textoParaDigitar?: string;
  /**
   * Só informa, sem ação: quando a ação não pode acontecer agora (ex.: etapa
   * com contatos dentro). Mostra um botão só, com `cancelText`.
   */
  apenasAviso?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'default',
  isLoading = false,
  icon,
  reversivel,
  comoDesfazer,
  textoParaDigitar,
  apenasAviso = false,
}) => {
  const [rodando, setRodando] = useState(false);
  const [digitado, setDigitado] = useState('');
  const ocupado = isLoading || rodando;
  const digitouCerto = !textoParaDigitar || digitado.trim() === textoParaDigitar.trim();

  useEffect(() => {
    if (!isOpen) {
      setDigitado('');
      setRodando(false);
    }
  }, [isOpen]);

  const handleConfirm = async (e: React.MouseEvent) => {
    // A janela só fecha quando a ação termina bem (o padrão do Radix fecharia já).
    e.preventDefault();
    if (ocupado || !digitouCerto) return;
    setRodando(true);
    try {
      logger.info('Ação de confirmação iniciada', { category: 'user_action', action: 'confirmation_dialog', title, variant });
      await onConfirm();
      logger.info('Ação de confirmação concluída', { category: 'user_action', action: 'confirmation_dialog', title, variant, status: 'success' });
      onClose();
    } catch (error) {
      logger.error('Erro na ação de confirmação', {
        category: 'user_action',
        action: 'confirmation_dialog',
        title,
        variant,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    } finally {
      setRodando(false);
    }
  };

  const handleOpenChange = (aberta: boolean) => {
    if (aberta || ocupado) return;
    logger.info('Ação de confirmação cancelada', { category: 'user_action', action: 'confirmation_dialog', title, variant });
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg" data-testid="confirmacao">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {icon && <span className="text-lg">{icon}</span>}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {typeof description === 'string' ? <p>{description}</p> : description}
              {reversivel === false && <p className="font-medium text-foreground">Isto não pode ser desfeito.</p>}
              {reversivel === true && (
                <p>{comoDesfazer ? `Dá para desfazer: ${comoDesfazer}` : 'Dá para desfazer depois.'}</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {textoParaDigitar && (
          <div className="space-y-2">
            <Label htmlFor="confirmacao-digitar" className="text-sm">
              Para confirmar, digite <span className="font-semibold">{textoParaDigitar}</span>
            </Label>
            <Input
              id="confirmacao-digitar"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              autoComplete="off"
              disabled={ocupado}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>{cancelText}</AlertDialogCancel>
          {!apenasAviso && (
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={ocupado || !digitouCerto}
              className={variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {ocupado ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aguarde...
                </>
              ) : (
                confirmText
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmationDialog;
