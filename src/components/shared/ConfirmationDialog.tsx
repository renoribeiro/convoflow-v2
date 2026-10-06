import React from 'react';
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
import { Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
  icon?: React.ReactNode;
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
  icon
}) => {
  const handleConfirm = async () => {
    try {
      logger.info('Ação de confirmação iniciada', {
        category: 'user_action',
        action: 'confirmation_dialog',
        title,
        variant
      });
      
      await onConfirm();
      
      logger.info('Ação de confirmação concluída', {
        category: 'user_action',
        action: 'confirmation_dialog',
        title,
        variant,
        status: 'success'
      });
    } catch (error) {
      logger.error('Erro na ação de confirmação', {
        category: 'user_action',
        action: 'confirmation_dialog',
        title,
        variant,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      throw error;
    }
  };

  const handleCancel = () => {
    logger.info('Ação de confirmação cancelada', {
      category: 'user_action',
      action: 'confirmation_dialog',
      title,
      variant
    });
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {icon && <span className="text-lg">{icon}</span>}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              confirmText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmationDialog;