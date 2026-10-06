/**
 * Convite aos tutoriais no Dashboard — o ÚNICO ponto de descoberta.
 *
 * Aparece só quando a Conta parece nova, e "nova" é medido pelo que já existe no
 * dado: nenhuma instância de WhatsApp cadastrada. Sem instância não há conversa,
 * chatbot nem campanha, então é exatamente aí que o caminho guiado importa —
 * e o cartão desaparece sozinho quando a primeira linha é conectada.
 *
 * A dispensa é local (localStorage), não coluna nova no banco.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import { TUTORIALS, tutorialKey } from '@/lib/help/tutorials';

/** Segue a convenção de chaves já usada no projeto (`convoflow:<assunto>`). */
export const TUTORIALS_CARD_DISMISSED_KEY = 'convoflow:tutorials-card-dismissed';

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(TUTORIALS_CARD_DISMISSED_KEY) === '1';
  } catch {
    // Modo privado / storage bloqueado: mostra o cartão, sem quebrar a tela.
    return false;
  }
};

export const OnboardingTutorialsCard = () => {
  const { instances, isLoading } = useWhatsAppInstances();
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(TUTORIALS_CARD_DISMISSED_KEY, '1');
    } catch {
      // Sem storage a dispensa vale só nesta sessão — aceitável.
    }
  };

  // Enquanto carrega, não pisca o cartão. Com instância cadastrada, a Conta já
  // saiu do zero e o convite não faz mais sentido.
  if (isLoading || dismissed || instances.length > 0) return null;

  const first = TUTORIALS[0];

  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <Button
        variant="ghost"
        size="icon"
        onClick={dismiss}
        aria-label="Dispensar sugestão de tutoriais"
        className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <GraduationCap className="h-5 w-5 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Comece por aqui: {TUTORIALS.length} tutoriais para colocar a operação no ar
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nenhum número de WhatsApp está conectado ainda. O passo-a-passo leva do zero ao primeiro
            atendimento automático.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {first && (
            <Button size="sm" asChild>
              <Link to={`/dashboard/help#${tutorialKey(first.id)}`}>{first.title}</Link>
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link to="/dashboard/help">Ver todos</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTutorialsCard;
