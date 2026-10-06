import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { IWhatsAppProvider, ProviderConfig } from './whatsapp-providers/base.ts';
import { EvolutionProvider } from './whatsapp-providers/evolution.ts';
import { WahaProvider } from './whatsapp-providers/waha.ts';
import { MetaProvider } from './whatsapp-providers/meta.ts';

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

        if (providerType === 'evolution') {
            const baseUrl = cfg.baseUrl || instance.evolution_api_url || '';
            const apiKey = cfg.apiKey || instance.evolution_api_key || '';

            if (!baseUrl || !apiKey) {
                throw new Error(
                    `Missing configuration for Evolution provider (instance: ${instance.instance_key})`,
                );
            }

            const config: ProviderConfig = {
                baseUrl,
                apiKey,
                instanceName: instance.instance_key,
            };
            return new EvolutionProvider(config);
        }

        if (providerType === 'waha') {
            const baseUrl = cfg.baseUrl || '';
            const apiKey = cfg.apiKey || '';

            if (!baseUrl) {
                throw new Error(
                    `Missing baseUrl for Waha provider (instance: ${instance.instance_key})`,
                );
            }

            const config: ProviderConfig = {
                baseUrl,
                apiKey,
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
