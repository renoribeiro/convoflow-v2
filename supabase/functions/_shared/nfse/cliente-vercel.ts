// Cliente da função da Vercel (api/nfse.js). Sem Deno: o Vitest importa.
//
// Toda falha de transporte (rede, timeout, 5xx, corpo estranho) vira
// { resultado: 'incerta' }: quem chamou não sabe se a nota saiu e TEM de
// consultar a DPS antes de mandar de novo. Recusa de configuração (401, 409,
// 503) também vira 'incerta', com o motivo, para o alerta dizer o que é.

import type { Ambiente } from './regras.ts';
import { cabecalhosAssinados } from './hmac.ts';

export interface ErroSefin {
  codigo: string;
  descricao: string;
  complemento?: string;
}

export interface RespostaNfse {
  resultado: 'emitida' | 'encontrada' | 'nao_encontrada' | 'cancelada' | 'rejeitada' | 'incerta' | 'ok' | 'certificado_vencido';
  idDps?: string;
  chaveAcesso?: string;
  nfseXml?: string;
  eventoXml?: string | null;
  jaEstava?: boolean;
  alertas?: ErroSefin[];
  erros?: ErroSefin[];
  detalhe?: string;
  validoAte?: string;
  diasRestantes?: number;
  aderenteEmissorNacional?: boolean;
  aderenteAmbienteNacional?: boolean;
  aliquota?: number | null;
}

export type AcaoNfse = 'emitir' | 'consultar_dps' | 'consultar_nfse' | 'cancelar' | 'parametros' | 'parametros_producao' | 'certificado';

export interface ClienteNfse {
  chamar(acao: AcaoNfse, dados?: Record<string, unknown>): Promise<RespostaNfse>;
}

export function criarClienteNfse(opts: {
  url: string;
  segredo: string;
  ambiente: Ambiente;
  fetch?: typeof fetch;
  timeoutMs?: number;
  agora?: () => Date;
}): ClienteNfse {
  const f = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 55_000;
  return {
    async chamar(acao, dados = {}) {
      const corpo = JSON.stringify({ ...dados, acao, ambiente: opts.ambiente });
      let res: Response;
      try {
        res = await f(opts.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(await cabecalhosAssinados(opts.segredo, corpo, opts.agora?.())) },
          body: corpo,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        return { resultado: 'incerta', detalhe: `sem resposta da função: ${(e as Error)?.name ?? 'erro'}` };
      }
      let json: Record<string, unknown> | null = null;
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        json = null;
      }
      if (res.status === 200 && json && typeof json.resultado === 'string') return json as unknown as RespostaNfse;
      // Dado inválido: a função recusou antes de falar com a Sefin, então não há nota.
      if (res.status === 400 && json?.erro === 'pedido_invalido') {
        return { resultado: 'rejeitada', erros: [{ codigo: 'PEDIDO_INVALIDO', descricao: `Campo inválido: ${String(json.campo ?? '?')}` }] };
      }
      const motivo = json && typeof json.erro === 'string' ? json.erro : `HTTP ${res.status}`;
      return { resultado: 'incerta', detalhe: `função recusou: ${motivo}` };
    },
  };
}
