/**
 * As notas do painel do contato (lote 6d, achado 48).
 *
 * Antes: o texto gravava 1 segundo depois da última tecla, "Salvo
 * automaticamente" era texto fixo, e fechar o painel (ou trocar de conversa)
 * antes desse segundo jogava a nota fora sem aviso. Agora quem fecha descarrega
 * o que falta na hora, e a tela mostra o estado de verdade.
 *
 * Regra pura, sem React: o painel liga cada contato a um salvador e chama
 * `mudou` a cada tecla, `descarregar` ao sair do campo e ao fechar.
 */

export type EstadoDaNota = 'parado' | 'salvando' | 'salvo' | 'erro';

export const TEXTO_DO_ESTADO: Record<EstadoDaNota, string> = {
  parado: 'A nota grava sozinha enquanto você escreve.',
  salvando: 'Salvando...',
  salvo: 'Salvo',
  erro: 'Não foi possível salvar.',
};

export interface SalvadorDeNotas {
  /** Uma tecla: grava daqui a `atrasoMs`, se nada mais mudar. */
  mudou(texto: string): void;
  /** Grava agora o que faltar. true = está tudo gravado. */
  descarregar(): Promise<boolean>;
  /** O texto que veio do servidor, quando não há nada por gravar aqui. */
  sincronizar(texto: string): void;
  /** Há texto digitado que ainda não foi gravado. */
  temPendente(): boolean;
}

export function criarSalvadorDeNotas(opcoes: {
  salvoInicial: string;
  /** Grava; erro = lança. */
  salvar: (texto: string) => Promise<void>;
  aoMudarEstado: (estado: EstadoDaNota) => void;
  atrasoMs?: number;
}): SalvadorDeNotas {
  const atraso = opcoes.atrasoMs ?? 1000;
  let salvo = opcoes.salvoInicial;
  let atual = opcoes.salvoInicial;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Uma gravação por vez, na ordem: a última tecla é sempre a que fica.
  let fila: Promise<boolean> = Promise.resolve(true);
  let estado: EstadoDaNota = 'parado';

  const mudarEstado = (e: EstadoDaNota) => {
    if (e === estado) return;
    estado = e;
    opcoes.aoMudarEstado(e);
  };

  const limparTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const gravarAgora = async (): Promise<boolean> => {
    const texto = atual;
    if (texto === salvo) {
      if (estado === 'salvando') mudarEstado('salvo');
      return true;
    }
    mudarEstado('salvando');
    try {
      await opcoes.salvar(texto);
      salvo = texto;
      // Digitou mais enquanto gravava: continua "Salvando..." até a próxima.
      if (atual === salvo) mudarEstado('salvo');
      return true;
    } catch {
      mudarEstado('erro');
      return false;
    }
  };

  const enfileirar = () => {
    fila = fila.then(gravarAgora, gravarAgora);
    return fila;
  };

  return {
    mudou(texto) {
      atual = texto;
      limparTimer();
      if (texto === salvo) {
        if (estado !== 'parado') mudarEstado('salvo');
        return;
      }
      mudarEstado('salvando');
      timer = setTimeout(() => {
        timer = null;
        void enfileirar();
      }, atraso);
    },
    descarregar() {
      limparTimer();
      return enfileirar();
    },
    sincronizar(texto) {
      if (atual !== salvo || timer !== null) return;
      salvo = texto;
      atual = texto;
    },
    temPendente() {
      return atual !== salvo;
    },
  };
}
