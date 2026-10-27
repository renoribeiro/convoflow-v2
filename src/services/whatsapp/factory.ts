import type { SafeInstanceRow } from '@/lib/whatsapp/safeInstanceColumns';
import { EvolutionAdapter } from './evolution.adapter';
import { MetaAdapter } from './meta.adapter';
import { InstagramAdapter } from './instagram.adapter';
import { WahaAdapter } from './waha.adapter';
import type { IWhatsAppProvider } from './provider.interface';
import { type ProviderInstance, type ProviderType } from './types';

/**
 * Aceita a linha de `whatsapp_instances` só com as colunas seguras
 * (`SAFE_INSTANCE_SELECT`) e produz o adapter certo. Nenhum adapter precisa
 * de chave: todos enviam pelo servidor.
 */
export function adapterForInstance(row: SafeInstanceRow): IWhatsAppProvider {
  const provider = ((row.provider as ProviderType | null) ?? 'evolution') as ProviderType;
  const instance: ProviderInstance = {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    instanceKey: row.instance_key,
    provider,
    status: row.status ?? 'disconnected',
    phoneNumber: row.phone_number,
    profileName: row.profile_name,
    profilePictureUrl: row.profile_picture_url,
    connectionConfig: (row.connection_config as Record<string, unknown> | null) ?? {},
  };
  return adapterFor(instance);
}

export function adapterFor(instance: ProviderInstance): IWhatsAppProvider {
  switch (instance.provider) {
    case 'waha':
      return new WahaAdapter(instance);
    case 'official':
      return new MetaAdapter(instance);
    // Nunca pode cair no `default`: um adapter de Evolution mandaria chamadas
    // de WhatsApp para um endereço de Instagram. Instância sem igAccountId faz
    // o construtor lançar — e a conversa fica SEM instância (ver
    // instanceForConversation.ts), nunca com a do WhatsApp.
    case 'instagram':
      return new InstagramAdapter(instance);
    case 'evolution':
    default:
      return new EvolutionAdapter(instance);
  }
}

export function providerLabel(provider: ProviderType): string {
  switch (provider) {
    case 'waha':
      return 'WAHA';
    case 'official':
      return 'WhatsApp Cloud (Meta)';
    case 'instagram':
      return 'Instagram';
    case 'evolution':
    default:
      return 'Evolution API';
  }
}
