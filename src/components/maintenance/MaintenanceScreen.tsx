import { useEffect, useState } from 'react';
import { Clock, LogOut, Loader2, Mail, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { SUPORTE_EMAIL } from '@/lib/billing/checkout';
import { formatarFaltando, formatarMomento } from '@/lib/maintenance/maintenanceState';
import { MaintenanceIllustration } from './MaintenanceIllustration';

interface MaintenanceScreenProps {
  /** Texto escrito pelo superadmin no painel de Administração. */
  reason: string | null;
  /** Fim da janela — a previsão de retorno. `null` = sem previsão. */
  endsAt: string | null;
  /** Repergunta ao servidor se a manutenção já acabou. */
  onRecheck: () => void;
}

/**
 * A tela que substitui o sistema durante a manutenção.
 *
 * ELA NÃO PODE PARECER ERRO. Quem chega aqui não fez nada de errado e nada
 * quebrou — está tudo funcionando conforme planejado, só não agora. Por isso:
 * sem vermelho, sem triângulo de alerta, sem a palavra "erro" ou "falha". A
 * cor é a da marca, o ícone é uma engrenagem girando devagar, e a primeira
 * frase diz que é temporário antes de dizer qualquer outra coisa.
 *
 * A diferença é prática, não estética: quem lê "erro" liga para o suporte
 * agora; quem lê "volta hoje às 15:00" espera. São duas cargas de atendimento
 * bem diferentes num dia em que o time já está ocupado com a manutenção.
 *
 * TRÊS COISAS SÃO OBRIGATÓRIAS AQUI, e todas as três existem para a pessoa não
 * ficar sem saída:
 *   1. o motivo, escrito por gente, não um código;
 *   2. a previsão de retorno — ou a admissão honesta de que não há uma;
 *   3. o contato de suporte, vindo de `lib/billing/checkout` (o mesmo par que
 *      o paywall e a landing publicam — um lugar só para mudar o telefone).
 */
export const MaintenanceScreen = ({ reason, endsAt, onRecheck }: MaintenanceScreenProps) => {
  const { logout } = useAuth();
  const [reconferindo, setReconferindo] = useState(false);

  // A contagem tem de andar sozinha. Sem isto, quem deixa a aba aberta lê "em
  // 40 min" indefinidamente e conclui que a página travou.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const retorno = formatarMomento(endsAt, agora);
  const faltando = formatarFaltando(endsAt, agora);

  const handleReconferir = () => {
    setReconferindo(true);
    onRecheck();
    // O refetch é rápido; o atraso existe só para o botão não piscar e a pessoa
    // ver que algo aconteceu.
    setTimeout(() => setReconferindo(false), 900);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Card className="overflow-hidden border-border/60 shadow-xl">
          <div className="bg-brand-primary/5 dark:bg-brand-primary/10 px-6 pt-10 pb-8 flex justify-center">
            <MaintenanceIllustration />
          </div>

          <CardContent className="space-y-6 pt-8">
            <div className="text-center space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-primary">
                Manutenção programada
              </p>
              <h1 className="text-2xl font-semibold text-foreground">
                Já já o ConvoFlow volta
              </h1>
              <p className="text-sm text-muted-foreground">
                Estamos trabalhando no sistema neste momento. Nada do que é seu foi perdido: suas
                conversas, contatos e configurações continuam no lugar e voltam exatamente como
                estavam.
              </p>
            </div>

            {reason ? (
              <div className="rounded-lg border bg-muted/40 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">O que estamos fazendo</p>
                {/* whitespace-pre-line: o superadmin escreve em texto livre e
                    costuma usar quebras de linha para listar. */}
                <p className="text-sm text-foreground whitespace-pre-line">{reason}</p>
              </div>
            ) : null}

            <div className="rounded-lg border border-brand-primary/25 bg-brand-primary/5 px-4 py-3 flex items-start gap-3">
              <Clock className="h-4 w-4 mt-0.5 text-brand-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Previsão de retorno</p>
                {retorno ? (
                  <p className="text-sm font-semibold text-foreground">
                    {retorno}
                    {faltando ? (
                      <span className="font-normal text-muted-foreground"> · {faltando}</span>
                    ) : null}
                  </p>
                ) : (
                  // Sem previsão é uma resposta legítima, e dizê-la é melhor que
                  // inventar um horário que não vai ser cumprido.
                  <p className="text-sm font-semibold text-foreground">
                    Ainda sem previsão
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · esta página se atualiza sozinha quando o sistema voltar
                    </span>
                  </p>
                )}
              </div>
            </div>

            <Button variant="outline" onClick={handleReconferir} className="w-full gap-2">
              {reconferindo ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Verificar se já voltou
            </Button>

            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-medium">Precisa de alguma coisa agora?</p>
              <a
                href={`mailto:${SUPORTE_EMAIL}`}
                className="inline-flex items-center gap-2 text-xs text-brand-primary hover:underline"
              >
                <Mail className="h-3.5 w-3.5" />
                Falar com o suporte por email
              </a>
              <p className="text-xs text-muted-foreground">{SUPORTE_EMAIL}</p>
            </div>
          </CardContent>

          <CardFooter className="justify-center border-t bg-muted/20 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground gap-2"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Esta página verifica sozinha, a cada minuto, se o sistema já voltou.
        </p>
      </div>
    </div>
  );
};
