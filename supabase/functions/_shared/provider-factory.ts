import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { IWhatsAppProvider, ProviderConfig } from './whatsapp-providers/base.ts';
import { EvolutionProvider } from './whatsapp-providers/evolution.ts';
import { WahaProvider } from './whatsapp-providers/waha.ts';
import { MetaProvider } from './whatsapp-providers/meta.ts';
import { loadProviderCredentials, resolveProviderCredentials } from './instance-credentials.ts';

interface InstanceData {
    id?: string;
    provider?: string;
    instance_key: string;
    connection_config?: Record<string, any>;
    // Legacy support
    evolution_api_url?: string;
    evolution_api_key?: string;
}

export class ProviderFactory {
    /**
     * Build a WhatsApp provider for the given instance row.
     *
     * For provider='official' a service-role Supabase client must be passed so
     * the access token can be loaded from Vault via the SECURITY DEFINER RPC.
     */
    static async getProvider(
        instance: InstanceData,
        supabase?: SupabaseClient,
    ): Promise<IWhatsAppProvider> {
        const providerType = instance.provider || 'evolution';
        const cfg = instance.connection_config || {};

        if (providerType === 'evolution' || providerType === 'waha') {
            // Endereço e chave vêm do cofre (desde 2026-10-26); a linha só
            // vale para número antigo, e o endereço do Evolution nunca sai
            // dela. Regra: _shared/instance-credentials.ts.
            // globalThis: este arquivo também entra no tsc do app (via chatbot-engine).
            const denoEnv = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
            const env = { evolutionBaseUrl: denoEnv?.get('EVOLUTION_API_URL') };
            const resolved = supabase
                ? await loadProviderCredentials(supabase as never, instance, env)
                : resolveProviderCredentials(instance, null, env);
            const creds = resolved.credentials;

            if (providerType === 'evolution') {
                if (!creds) {
                    throw new Error(
                        `Missing configuration for Evolution provider (instance: ${instance.instance_key})`,
                    );
                }
                const config: ProviderConfig = {
                    baseUrl: creds.baseUrl,
                    apiKey: creds.apiKey,
                    instanceName: instance.instance_key,
                };
                return new EvolutionProvider(config);
            }

            if (!creds) {
                throw new Error(
                    `Missing baseUrl for Waha provider (instance: ${instance.instance_key})`,
                );
            }
            const config: ProviderConfig = {
                baseUrl: creds.baseUrl,
                apiKey: creds.apiKey,
                instanceName: cfg.sessionName || instance.instance_key,
            };
            return new WahaProvider(config);
        }

        if (providerType === 'official') {
            if (!supabase) {
                throw new Error(
                    'Meta provider requires a Supabase service-role client to resolve the access token',
                );
            }
            if (!instance.id) {
                throw new Error('Meta provider requires instance.id to fetch the access token');
            }

            const phoneNumberId = cfg.phoneNumberId;
            if (!phoneNumberId) {
                throw new Error(
                    `Missing phoneNumberId for Meta provider (instance: ${instance.instance_key})`,
                );
            }

            const { data: tokenData, error: tokenError } = await supabase.rpc(
                'get_instance_meta_token',
                { p_instance_id: instance.id },
            );
            if (tokenError) {
                throw new Error(`Failed to load Meta access token: ${tokenError.message}`);
            }
            const accessToken = (tokenData as unknown as string) || '';
            if (!accessToken) {
                throw new Error(
                    `No Meta access token stored for instance: ${instance.instance_key}`,
                );
            }

            return new MetaProvider({
                baseUrl: '',
                apiKey: accessToken,
                instanceName: phoneNumberId,
                phoneNumberId,
                wabaId: cfg.wabaId,
                accessToken,
                graphApiVersion: cfg.graphApiVersion || 'v20.0',
            });
        }

        throw new Error(`Unsupported provider type: ${providerType}`);
    }
}
