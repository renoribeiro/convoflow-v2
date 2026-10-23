// =============================================================================
// api/banco — a ponte entre o núcleo da API e o Postgres (só Deno)
// =============================================================================
// Conexão direta (secret padrão SUPABASE_DB_URL, papel postgres). Três usos:
//   - usarChave e registrar: como servidor (api_chave_usar, INSERT em
//     api_registro);
//   - comoDono: UMA transação com SET LOCAL ROLE authenticated e o sub do dono
//     da chave em request.jwt.claims. É a mesma troca que as suítes SQL fazem
//     para provar o RLS. As api_v1_* recusam (42501) se a troca não aconteceu,
//     e o núcleo confere current_user/auth.uid() antes de ler.
// A chave de serviço do Supabase não lê dado aqui: só assina link de mídia
// (Storage), depois que a leitura como o dono disse qual arquivo é de quem.
// =============================================================================

import postgres from 'npm:postgres@3.4.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  sqlDaChamada,
  type ComoDono,
  type DependenciasApi,
  type LinhaDeRegistro,
  type UsoDaChave,
} from './nucleo.ts';
import { WHATSAPP_MEDIA_BUCKET } from '../media-links.ts';

type Sql = ReturnType<typeof postgres>;
let conexao: Sql | null = null;

function sql(): Sql {
  if (conexao) return conexao;
  const url = Deno.env.get('SUPABASE_DB_URL');
  if (!url) throw new Error('SUPABASE_DB_URL ausente');
  conexao = postgres(url, {
    prepare: false, // funciona também atrás do pooler em modo transação
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return conexao;
}

let admin: ReturnType<typeof createClient> | null = null;
function storageDoServidor() {
  if (!admin) {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !chave) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente');
    admin = createClient(url, chave, { auth: { persistSession: false } });
  }
  return admin.storage.from(WHATSAPP_MEDIA_BUCKET);
}

export function dependenciasDoBanco(log?: DependenciasApi['log']): DependenciasApi {
  return {
    log,
    agora: () => new Date(),
    origemDoProjeto: Deno.env.get('SUPABASE_URL') ?? undefined,
    liberacao: {
      habilitada: Deno.env.get('API_ADDON_ENABLED'),
      contasDeTeste: Deno.env.get('API_ADDON_TEST_CONTAS'),
    },

    async usarChave(hash: string, ip: string | null): Promise<UsoDaChave | null> {
      const linhas = await sql()`
        SELECT resultado, detalhe, chave_id::text, conta_id::text, dono_user_id::text,
               escopos, lojas::text[] AS lojas, restante_minuto, restante_dia
          FROM public.api_chave_usar(${hash}, ${ip})`;
      return (linhas[0] as unknown as UsoDaChave) ?? null;
    },

    async comoDono<T>(donoUserId: string, fn: (q: ComoDono) => Promise<T>): Promise<T> {
      const claims = JSON.stringify({ sub: donoUserId, role: 'authenticated', aud: 'authenticated' });
      return (await sql().begin(async (tx) => {
        await tx.unsafe(`SET LOCAL statement_timeout = '8s'`);
        await tx.unsafe('SET LOCAL ROLE authenticated');
        await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;
        const q: ComoDono = {
          async quemSou() {
            const [r] = await tx`SELECT current_user::text AS papel, auth.uid()::text AS uid`;
            return { papel: (r?.papel as string) ?? null, uid: (r?.uid as string) ?? null };
          },
          async contaLiberada(contaId: string) {
            const [r] = await tx`SELECT unlocked FROM public.tenant_access_state(${contaId}::uuid)`;
            return r?.unlocked === true;
          },
          async chamar(c) {
            const linhas = await tx.unsafe(sqlDaChamada(c), c.args as never[]);
            return linhas as unknown as Record<string, unknown>[];
          },
        };
        return await fn(q);
      })) as T;
    },

    async assinar(caminhos: string[], validadeS: number) {
      const { data, error } = await storageDoServidor().createSignedUrls(caminhos, validadeS);
      if (error) throw new Error(`assinatura: ${error.message}`);
      return (data ?? []).map((d: { path: string | null; signedUrl: string | null; error: string | null }) => ({
        path: d.path ?? '',
        signedUrl: d.error ? null : d.signedUrl,
      }));
    },

    async registrar(l: LinhaDeRegistro) {
      await sql()`
        INSERT INTO public.api_registro
          (chave_id, conta_id, canal, metodo, rota, filtros, linhas, status, resultado, ip, midia_ids, duracao_ms)
        VALUES
          (${l.chave_id}::uuid, ${l.conta_id}::uuid, ${l.canal}, ${l.metodo}, ${l.rota},
           ${sql().json(l.filtros as never)}, ${l.linhas}, ${l.status}, ${l.resultado}, ${l.ip},
           ${l.midia_ids ? `{${l.midia_ids.join(',')}}` : null}::uuid[], ${l.duracao_ms})`;
    },
  };
}
