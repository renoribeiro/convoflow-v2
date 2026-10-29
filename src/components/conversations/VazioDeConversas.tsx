import { useNavigate } from 'react-router-dom';
import { MessageSquare, Smartphone } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAcessoTelas } from '@/hooks/useAcessoTelas';
import { NewConversationModal } from './NewConversationModal';

interface VazioDeConversasProps {
  /** A Loja tem número de WhatsApp? null enquanto a lista de números carrega. */
  temNumero: boolean | null;
  /** Lado do Instagram: lá não existe "Nova conversa" nem número de WhatsApp. */
  ladoInstagram: boolean;
}

/**
 * Lista de conversas vazia (lote 6c, B13, decisão D8):
 *  - Loja sem número: quem configura WhatsApp vê "Conectar número"; quem não
 *    configura (o atendente) lê a quem pedir;
 *  - com número: "Nova conversa".
 */
export function VazioDeConversas({ temNumero, ladoInstagram }: VazioDeConversasProps) {
  const navigate = useNavigate();
  const { acesso } = useAcessoTelas();

  if (!ladoInstagram && temNumero === false) {
    const podeConectar = acesso('whatsapp-numbers') === 'liberado';
    return (
      <EmptyState
        icon={<Smartphone className="h-10 w-10" />}
        title="Nenhum número conectado"
        description={
          podeConectar
            ? 'Conecte o número de WhatsApp da Loja: as conversas dos clientes chegam aqui sozinhas.'
            : 'Peça ao Gestor da Loja para conectar um número. Depois disso, as conversas dos clientes chegam aqui sozinhas.'
        }
        action={
          podeConectar
            ? { label: 'Conectar número', onClick: () => navigate('/dashboard/whatsapp-numbers') }
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col items-center">
      <EmptyState
        icon={<MessageSquare className="h-10 w-10" />}
        title="Nenhuma conversa encontrada"
        description={
          ladoInstagram
            ? 'Confira os filtros acima. Conversa nova aparece aqui sozinha assim que o cliente escreve.'
            : 'Confira os filtros acima. Conversa nova aparece aqui sozinha assim que o cliente escreve; para falar primeiro, use Nova conversa.'
        }
        className="pb-4"
      />
      {!ladoInstagram && temNumero && <NewConversationModal noVazio />}
    </div>
  );
}
