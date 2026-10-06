import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/logger.ts'
import { corsHeaders, DataSanitizer } from '../_shared/validation.ts'
import { ProviderFactory } from '../_shared/provider-factory.ts'
import { guardBackendCaller } from '../_shared/backend-gate.ts'

interface Job {
  id: string
  tenant_id: string
  job_type: 'send_message' | 'campaign_message' | 'follow_up_message' | 'chatbot_response' | string
  job_data: JobData
  current_attempts: number
}

interface JobData {
  instanceName: string;
  phone?: string;
  message?: string;
  contactId?: string;
  campaignId?: string;
  messageText?: string;
  messageIndex?: number;
  randomDelay?: number;
  sequenceId?: string;
  stepId?: string;
  chatbotId?: string;
  incomingMessage?: string;
  [key: string]: unknown;
}

serve(async (req) => {
  const logger = createLogger(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Item 14, lote 2: só o cron (x-cron-secret) ou a chave secreta do projeto.
  const denied = await guardBackendCaller(req, logger)
  if (denied) return denied

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Missing Supabase configuration");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    logger.info('Job worker started...')

    const maxProcessingTime = 45 * 1000 // 45 seconds to avoid Edge Function timeout
    const startTime = Date.now()

    let jobsProcessed = 0
    let successCount = 0
    let errorCount = 0

    while (Date.now() - startTime < maxProcessingTime) {
      try {
        const { data: jobs, error: dequeueError } = await supabase.rpc('dequeue_next_job', {
          p_job_types: ['send_message', 'campaign_message', 'follow_up_message', 'chatbot_response']
        })

        if (dequeueError) {
          logger.error('Error dequeuing job', { error: dequeueError })
          await new Promise(resolve => setTimeout(resolve, 5000)) 
          continue
        }

        if (!jobs || jobs.length === 0) {
          logger.debug('No jobs in queue, waiting...')
          await new Promise(resolve => setTimeout(resolve, 10000))
          continue
        }

        const job: Job = jobs[0]
        logger.info(`Processing job ${job.id} (${job.job_type}) - Attempt ${job.current_attempts}`, { jobId: job.id, type: job.job_type })

        try {
          await processJob(supabase, job, logger)
          
          await supabase.rpc('complete_job', {
            p_job_id: job.id,
            p_success: true
          })

          successCount++
          logger.info(`Job ${job.id} completed successfully`, { jobId: job.id })

        } catch (jobError: any) {
          logger.error(`Job ${job.id} failed`, { jobId: job.id, error: jobError.message })
          
          await supabase.rpc('complete_job', {
            p_job_id: job.id,
            p_success: false,
            p_error_message: jobError.message
          })

          errorCount++
        }

        jobsProcessed++
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error: any) {
        logger.error('Error in job processing loop', { error: error.message })
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }

    logger.info(`Job worker finished`, { jobsProcessed, successCount, errorCount })

    return new Response(JSON.stringify({
      success: true,
      jobsProcessed,
      successCount,
      errorCount,
      duration: Date.now() - startTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    logger.error('Job worker error', { error: error.message })
    
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

async function processJob(supabase: SupabaseClient, job: Job, logger: any) {
  const { job_type, job_data, tenant_id } = job

  switch (job_type) {
    case 'send_message':
      await processSendMessage(supabase, job_data, tenant_id, logger)
      break
      
    case 'campaign_message':
      await processCampaignMessage(supabase, job_data, tenant_id, logger)
      break
      
    case 'follow_up_message':
      await processFollowUpMessage(supabase, job_data, tenant_id, logger)
      break
      
    case 'chatbot_response':
      await processChatbotResponse(supabase, job_data, tenant_id, logger)
      break
      
    default:
      throw new Error(`Unknown job type: ${job_type}`)
  }
}

async function processSendMessage(supabase: SupabaseClient, jobData: JobData, tenantId: string, logger: any) {
  const { instanceName, phone, message, contactId } = jobData

  if (!phone || !message) {
      throw new Error("Missing phone or message in job data");
  }

  // 1. Fetch Instance Configuration (Provider Agnostic)
  const { data: instance, error: instanceError } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('instance_key', instanceName)
    .eq('tenant_id', tenantId)
    .single()

  if (instanceError || !instance) {
    throw new Error(`Instance not found: ${instanceName} (Tenant: ${tenantId})`);
  }

  // Gate de janela de 24h — obrigatório para instâncias oficiais (Meta Cloud API).
  // Cf. meta-cloud-api/SKILL.md §8.3 e whatsapp-policies/SKILL.md §1.2.
  // Em erro de RPC, fazemos fail-open (a Meta rejeita com 131047 se realmente fora da janela).
  if ((instance.provider ?? 'evolution') === 'official') {
    try {
      const { data: withinWindow, error: windowError } = await supabase.rpc(
        'is_within_service_window',
        { p_instance_id: instance.id, p_phone: phone }
      );
      if (windowError) {
        logger.warn('is_within_service_window RPC falhou — prosseguindo (fail-open)', {
          instanceId: instance.id,
          error: windowError.message,
        });
      } else if (withinWindow === false) {
        throw new Error(
          'Fora da janela de 24h: número oficial exige template aprovado.'
        );
      }
    } catch (windowErr: any) {
      // Se a exceção foi criada por nós (fora da janela), propaga.
      if (windowErr.message?.startsWith('Fora da janela')) throw windowErr;
      // Falha de RPC: fail-open.
      logger.warn('is_within_service_window falhou inesperadamente — fail-open', {
        error: windowErr.message,
      });
    }
  }

  // 2. Instantiate Provider
  const provider = await ProviderFactory.getProvider(instance, supabase);

  // 3. Send Message
  const result = await provider.sendMessage(phone, message);

  // 4. Save to Database
  if (contactId) {
    // Note: 'result.key.id' works for Evolution. Waha might return different structure.
    // Ideally we normalize result in the provider too. For now we use best effort.
    const messageId = result.key?.id || result.id || result.messageId || 'unknown';

    await supabase.from('messages').insert({
      contact_id: contactId,
      tenant_id: tenantId,
      whatsapp_instance_id: instance.id,
      direction: 'outbound',
      message_type: 'text',
      content: message,
      evolution_message_id: messageId,
      status: 'sent',
    })
  }

  logger.info(`Message sent via ${instanceName} (${instance.provider || 'evolution'})`, { phone: DataSanitizer.sanitizePhoneNumber(phone) })
}


async function processCampaignMessage(supabase: SupabaseClient, jobData: JobData, tenantId: string, logger: any) {
  const { campaignId, contactId, messageText, instanceName, messageIndex } = jobData

  if (!contactId || !campaignId || !messageText) {
      throw new Error("Missing required fields for campaign message");
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('phone, name')
    .eq('id', contactId)
    .single()

  if (!contact) {
    throw new Error('Contact not found')
  }

  // contacts.phone virou anulável na fatia 1 do Instagram. Campanha por
  // WhatsApp não alcança contato sem telefone — falha explícita em vez de
  // mandar um destinatário vazio para o provedor.
  if (!contact.phone) {
    throw new Error('Contact has no phone number (não é um contato de WhatsApp)')
  }

  const { data: campaign } = await supabase
    .from('mass_message_campaigns')
    .select('enable_message_randomization, message_templates, message_template')
    .eq('id', campaignId)
    .single()

  if (!campaign) {
    throw new Error('Campaign not found')
  }

  let selectedMessage = messageText
  
  if (campaign.enable_message_randomization && campaign.message_templates && campaign.message_templates.length > 0) {
    if (messageIndex !== undefined && messageIndex < campaign.message_templates.length) {
      selectedMessage = campaign.message_templates[messageIndex]
    } else {
      const randomIndex = Math.floor(Math.random() * campaign.message_templates.length)
      selectedMessage = campaign.message_templates[randomIndex]
    }
  } else {
    selectedMessage = campaign.message_template || messageText
  }

  const finalMessage = processSpintax(selectedMessage, {
    nome: contact.name || contact.phone,
    telefone: contact.phone,
  })

  try {
    await processSendMessage(supabase, {
      instanceName,
      phone: contact.phone,
      message: finalMessage,
      contactId,
    }, tenantId, logger)

    await supabase
      .from('campaign_executions')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId)

    await supabase.rpc('increment_campaign_sent_count', {
      p_campaign_id: campaignId
    })

    logger.info(`Campaign message sent`, { phone: DataSanitizer.sanitizePhoneNumber(contact.phone) })

  } catch (error: any) {
    await supabase
      .from('campaign_executions')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: error.message,
      })
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId)

    throw error
  }
}

async function processFollowUpMessage(supabase: SupabaseClient, jobData: JobData, tenantId: string, logger: any) {
  const { sequenceId, stepId, contactId, instanceName } = jobData

  if (!stepId || !contactId) throw new Error("Missing stepId or contactId");

  const { data: step } = await supabase
    .from('follow_up_steps')
    .select('message_text, message_type, media_url')
    .eq('id', stepId)
    .single()

  if (!step) {
    throw new Error('Follow-up step not found')
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('phone, name')
    .eq('id', contactId)
    .single()

  if (!contact) {
    throw new Error('Contact not found')
  }

  // Ver processCampaignMessage: phone anulável desde a fatia 1 do Instagram.
  if (!contact.phone) {
    throw new Error('Contact has no phone number (não é um contato de WhatsApp)')
  }

  const finalMessage = processSpintax(step.message_text, {
    nome: contact.name || contact.phone,
    telefone: contact.phone,
  })

  await processSendMessage(supabase, {
    instanceName,
    phone: contact.phone,
    message: finalMessage,
    contactId,
  }, tenantId, logger)

  logger.info(`Follow-up message sent`, { phone: DataSanitizer.sanitizePhoneNumber(contact.phone) })
}

async function processChatbotResponse(supabase: SupabaseClient, jobData: JobData, tenantId: string, logger: any) {
  logger.debug('Processing chatbot response', { jobData });
  
  try {
    const { data: chatbot, error: chatbotError } = await supabase
      .from('chatbots')
      .select('*')
      .eq('id', jobData.chatbotId)
      .single();

    if (chatbotError || !chatbot) {
      throw new Error(`Chatbot not found: ${chatbotError?.message}`);
    }

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', jobData.contactId)
      .single();

    if (contactError || !contact) {
      throw new Error(`Contact not found: ${contactError?.message}`);
    }

    // Ver processCampaignMessage: phone anulável desde a fatia 1 do Instagram.
    if (!contact.phone) {
      throw new Error('Contact has no phone number (não é um contato de WhatsApp)');
    }

    const { data: processedMessage, error: processError } = await supabase
      .rpc('process_chatbot_variables', {
        p_message_template: chatbot.response_message,
        p_contact_id: contact.id,
        p_incoming_message: jobData.incomingMessage
      });

    if (processError) {
      throw new Error(`Variable processing failed: ${processError.message}`);
    }

    const finalMessage = processSpintax(processedMessage || chatbot.response_message);

    logger.info('Sending chatbot response', {
      chatbotName: chatbot.name,
      contactPhone: DataSanitizer.sanitizePhoneNumber(contact.phone)
    });

    await processSendMessage(supabase, {
      instanceName: jobData.instanceName,
      phone: contact.phone,
      message: finalMessage,
      contactId: contact.id
    }, tenantId, logger);

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_key', jobData.instanceName)
      .single();

    if (instance) {
      await supabase
        .from('messages')
        .insert({
          contact_id: contact.id,
          tenant_id: tenantId,
          whatsapp_instance_id: instance.id,
          direction: 'outbound',
          message_type: chatbot.response_type || 'text',
          content: finalMessage,
          status: 'sent',
          is_from_bot: true
        });
    }

    logger.info(`Chatbot response sent successfully`, { phone: DataSanitizer.sanitizePhoneNumber(contact.phone) });

  } catch (error) {
    logger.error('Error processing chatbot response', { error });
    throw error;
  }
}

function processSpintax(text: string, variables: Record<string, string> = {}): string {
  let result = text

  // 1. Double braces replacement {{var}}
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }

  // 2. Single braces replacement {var}
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }

  // 3. Spintax evaluation {opt1|opt2} (must contain a pipe)
  const spintaxRegex = /{([^{}]*\|[^{}]*)}/g
  result = result.replace(spintaxRegex, (match, options) => {
    const choices = options.split('|')
    return choices[Math.floor(Math.random() * choices.length)]
  })

  return result
}