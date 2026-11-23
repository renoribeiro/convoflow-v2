/**
 * aviso-de-espera — "Recebemos sua mensagem!" quando a paciente espera (2026-11-23).
 *
 * Quem decide QUEM recebe é o banco: public.aviso_de_espera_pendentes()
 * (migração 20261123000001). Esta função só envia, pelo mesmo caminho do
 * chatbot (sendBotMessage): a linha fica com is_from_bot = true e
 * source = 'aviso_espera', então não conta como resposta de pessoa, não para
 * nem reabre o chatbot, e o eco do Evolution é reconhecido como do bot.
 *
 * Chamada só pelo cron (public.cron_worker_kick('aviso-de-espera'), com
 * x-cron-secret), e só quando há aviso pendente. Conta sem acesso ou teste
 * grátis sem envios no dia: o aviso não sai.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { corsHeaders } from '../_shared/validation.ts';
import { guardBackendCaller } from '../_shared/backend-gate.ts';
import { criarMemoDeAcesso } from '../_shared/conta-acesso.ts';
import { criarCotaDeEnvios } from '../_shared/limites-do-teste.ts';
import { sendBotMessage, type EngineContext, type WhatsAppInstanceLike } from '../_shared/chatbot-engine.ts';
import { FONTE_DO_AVISO, TEXTO_DO_AVISO_DE_ESPERA } from '../_shared/aviso-de-espera.ts';

interface Pendente {
  conversation_id: string;
  tenant_id: string;
  contact_id: string;
  whatsapp_instance_id: string;
  phone: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  const logger = createLogger(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const denied = await guardBackendCaller(req, logger);
  if (denied) return denied;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Configuration Error' }, 500);
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase.rpc('aviso_de_espera_pendentes');
  if (error) {
    logger.error('aviso-de-espera: não li os pendentes', { error: error.message });
    return json({ error: 'Internal server error' }, 500);
  }
  const pendentes = (data ?? []) as Pendente[];

  const acesso = criarMemoDeAcesso(supabase, (id, erro) =>
    logger.error('aviso-de-espera: não conferi o acesso', { tenant_id: id, erro }));
  const cota = criarCotaDeEnvios(supabase, (id, erro) =>
    logger.error('aviso-de-espera: não conferi o limite do teste', { tenant_id: id, erro }));

  const stats = { enviados: 0, pulados: 0 };
  for (const p of pendentes) {
    try {
      if (!(await acesso.liberada(p.tenant_id)) || (await cota.podeEnviar(p.tenant_id)) !== 'sim') {
        stats.pulados++;
        continue;
      }
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, tenant_id, instance_key, provider, connection_config, evolution_api_url, evolution_api_key')
        .eq('id', p.whatsapp_instance_id)
        .eq('tenant_id', p.tenant_id)
        .maybeSingle();
      if (!instance) {
        stats.pulados++;
        continue;
      }
      await sendBotMessage(
        TEXTO_DO_AVISO_DE_ESPERA,
        {
          tenant_id: p.tenant_id,
          whatsapp_instance_id: p.whatsapp_instance_id,
          contact_id: p.contact_id,
          phone: p.phone,
          message: '',
        },
        { supabase: supabase as unknown as EngineContext['supabase'], logger, instance: instance as WhatsAppInstanceLike },
        FONTE_DO_AVISO,
      );
      await cota.registrarEnvio(p.tenant_id);
      stats.enviados++;
    } catch (err) {
      logger.error('aviso-de-espera: falhou numa conversa', { conversation_id: p.conversation_id, error: String(err) });
    }
  }

  logger.info('aviso-de-espera: rodada', stats);
  return json({ success: true, ...stats });
});
