import { supabase } from '@/integrations/supabase/client';
import type { BillingOverview, StripeStatus } from '@/lib/billing/adminBilling';

// Commission payment interface
export interface CommissionPayment {
  id: string;
  affiliate_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'paid' | 'completed' | 'failed' | 'cancelled';
  stripe_transfer_id?: string;
  stripe_payout_id?: string;
  description?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  paid_at?: string;
  affiliateId?: string; // Compatibility with stripeMcpService
}

// Affiliate Stripe account interface
export interface AffiliateStripeAccount {
  id: string;
  affiliate_id: string;
  stripe_account_id: string;
  account_status: 'pending' | 'restricted' | 'enabled' | 'disabled';
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/** Cupom de desconto — espelha public.coupons (valores em REAIS, não centavos). */
export interface Coupon {
  id: string;
  code: string;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id?: string | null;
  discount_type: 'percent' | 'amount';
  discount_value: number;
  duration?: 'once' | 'repeating' | 'forever';
  duration_in_months?: number | null;
  max_uses: number | null;
  current_uses: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCouponPayload {
  code: string;
  discount_type: 'percent' | 'amount';
  /** Percentual (0–100) ou valor em REAIS — a conversão p/ centavos é no servidor. */
  discount_value: number;
  duration: 'once' | 'repeating' | 'forever';
  /** Obrigatório quando duration = 'repeating'. */
  duration_in_months?: number | null;
  /** null/undefined = usos ilimitados. */
  max_uses?: number | null;
  /** ISO string. null/undefined = sem expiração. */
  valid_until?: string | null;
}

export interface ArchiveCouponPayload {
  coupon_id: string;
  stripe_coupon_id?: string | null;
}


class StripeService {
  /**
   * O supabase-js entrega apenas "Edge Function returned a non-2xx status code"
   * quando a função responde 4xx — a mensagem real (em pt-BR) vem no corpo, que
   * fica em `error.context`.
   */
  private async functionError(error: any): Promise<Error> {
    return new Error(await this.extractFunctionError(error));
  }

  /**
   * Admin: a conexão com o Stripe pela secret STRIPE_SECRET_KEY — conta, os dois
   * preços e o webhook. Só leitura: não grava nada em lugar nenhum.
   */
  async getStripeStatus(): Promise<StripeStatus> {
    const { data, error } = await supabase.functions.invoke('stripe-admin', {
      body: { action: 'get_status' }
    });
    if (error) throw await this.functionError(error);
    return data as StripeStatus;
  }

  /**
   * Admin: números ao vivo da conta do Stripe da secret (receita mensal,
   * próximas cobranças, receita por mês, falhas) e as Contas com assinatura
   * fora dela.
   */
  async getBillingOverview(): Promise<BillingOverview> {
    const { data, error } = await supabase.functions.invoke('stripe-admin', {
      body: { action: 'billing_overview' }
    });
    if (error) throw await this.functionError(error);
    return data as BillingOverview;
  }

  /**
   * Process Batch Commission Payments
   */
  async processBatchCommissionPayments(payments: CommissionPayment[]): Promise<{ id: string; status: string; error?: string }[]> {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-admin', {
        body: { action: 'process_batch_commissions', payload: { payments } }
      });
      if (error) throw error;
      return data.results;
    } catch (error) {
      console.error('Error processing batch commissions:', error);
      throw error;
    }
  }

  /**
   * O supabase-js entrega apenas "Edge Function returned a non-2xx status code"
   * quando a função responde 400 — a mensagem real (em pt-BR) vem no corpo, que
   * fica em `error.context`. Sem isso o dialog de cupom mostraria erro genérico.
   */
  private async extractFunctionError(error: any): Promise<string> {
    try {
      const body = await error?.context?.json?.();
      if (body?.error) return String(body.error);
    } catch {
      // corpo não-JSON ou já consumido → cai no fallback
    }
    return error?.message || 'Erro inesperado ao falar com o Stripe.';
  }

  /**
   * Admin: cria um cupom (Coupon + Promotion Code no Stripe e a linha em coupons).
   */
  async createCoupon(payload: CreateCouponPayload): Promise<{
    success: boolean;
    coupon_id: string;
    promotion_code_id: string;
    coupon?: Coupon;
  }> {
    const { data, error } = await supabase.functions.invoke('stripe-admin', {
      body: { action: 'create_coupon', payload }
    });
    if (error) throw new Error(await this.extractFunctionError(error));
    return data;
  }

  /**
   * Admin: lista os cupons cadastrados (mais recentes primeiro).
   */
  async listCoupons(): Promise<Coupon[]> {
    const { data, error } = await supabase.functions.invoke('stripe-admin', {
      body: { action: 'list_coupons' }
    });
    if (error) throw new Error(await this.extractFunctionError(error));
    return (data as Coupon[]) || [];
  }

  /**
   * Admin: arquiva um cupom — desativa o Promotion Code e remove o Coupon do
   * Stripe (assinaturas que já aplicaram o desconto não são afetadas).
   */
  async archiveCoupon(payload: ArchiveCouponPayload): Promise<{ success: boolean; warnings?: string[] }> {
    const { data, error } = await supabase.functions.invoke('stripe-admin', {
      body: { action: 'archive_coupon', payload }
    });
    if (error) throw new Error(await this.extractFunctionError(error));
    return data;
  }

  // Database operations
  async getCommissionPayments(affiliateId?: string): Promise<CommissionPayment[]> {
    try {
      let query = supabase
        .from('commission_payments')
        .select(`*, affiliates:affiliate_id(name, email)`)
        .order('created_at', { ascending: false });

      if (affiliateId) query = query.eq('affiliate_id', affiliateId);

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) as CommissionPayment[] || [];
    } catch (error) {
      console.error('Error fetching commission payments:', error);
      return [];
    }
  }

  /**
   * Aggregate commission-payment stats for the admin dashboard.
   * Swallows errors (returns zeros) so the Pagamentos tab never crashes when
   * Stripe/commission tracking is not configured yet.
   */
  async getPaymentStatistics(affiliateId?: string): Promise<{
    totalPaid: number;
    totalPending: number;
    totalFailed: number;
    totalPayments: number;
    averagePayment: number;
  }> {
    const empty = { totalPaid: 0, totalPending: 0, totalFailed: 0, totalPayments: 0, averagePayment: 0 };
    try {
      let query = supabase.from('commission_payments').select('amount, status');
      if (affiliateId) query = query.eq('affiliate_id', affiliateId);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data as any[]) || [];
      const stats = { ...empty, totalPayments: rows.length };
      for (const row of rows) {
        const amount = Number(row.amount) || 0;
        switch (row.status) {
          case 'paid':
          case 'completed':
            stats.totalPaid += amount;
            break;
          case 'failed':
          case 'cancelled':
            stats.totalFailed += amount;
            break;
          default: // pending, processing
            stats.totalPending += amount;
            break;
        }
      }
      stats.averagePayment = rows.length ? (stats.totalPaid + stats.totalPending + stats.totalFailed) / rows.length : 0;
      return stats;
    } catch (error) {
      console.error('Error fetching payment statistics:', error);
      return empty;
    }
  }

  async createCommissionPayment(affiliateId: string, amount: number, description?: string, metadata?: Record<string, any>): Promise<CommissionPayment | null> {
    try {
      const { data, error } = await supabase
        .from('commission_payments')
        .insert({ affiliate_id: affiliateId, amount, description, metadata, status: 'pending' })
        .select().single();
      if (error) throw error;
      return (data as any) as CommissionPayment;
    } catch (error) {
      console.error('Error creating commission payment:', error);
      return null;
    }
  }

  async updateCommissionPaymentStatus(paymentId: string, status: CommissionPayment['status'], stripeTransferId?: string, stripePayoutId?: string): Promise<boolean> {
    try {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (stripeTransferId) updateData.stripe_transfer_id = stripeTransferId;
      if (stripePayoutId) updateData.stripe_payout_id = stripePayoutId;
      if (status === 'paid' || status === 'completed') updateData.paid_at = new Date().toISOString();

      const { error } = await supabase.from('commission_payments').update(updateData).eq('id', paymentId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating commission payment:', error);
      return false;
    }
  }

  async getAffiliateStripeAccounts(affiliateId?: string): Promise<AffiliateStripeAccount[]> {
    try {
      let query = supabase
        .from('affiliate_stripe_accounts')
        .select(`*, affiliates:affiliate_id(name, email)`)
        .order('created_at', { ascending: false });
      if (affiliateId) query = query.eq('affiliate_id', affiliateId);

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) as AffiliateStripeAccount[] || [];
    } catch (error) {
      console.error('Error fetching affiliate Stripe accounts:', error);
      return [];
    }
  }

  async createAffiliateStripeAccount(affiliateId: string, stripeAccountId: string): Promise<AffiliateStripeAccount | null> {
    try {
      const { data, error } = await supabase
        .from('affiliate_stripe_accounts')
        .insert({ affiliate_id: affiliateId, stripe_account_id: stripeAccountId, account_status: 'pending' })
        .select().single();
      if (error) throw error;
      return (data as any) as AffiliateStripeAccount;
    } catch (error) {
      console.error('Error creating affiliate Stripe account:', error);
      return null;
    }
  }

  async updateAffiliateStripeAccount(accountId: string, updates: Partial<Pick<AffiliateStripeAccount, 'account_status' | 'charges_enabled' | 'payouts_enabled' | 'details_submitted' | 'requirements'>>): Promise<boolean> {
    try {
      const { error } = await supabase.from('affiliate_stripe_accounts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', accountId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating affiliate Stripe account:', error);
      return false;
    }
  }
}

// Export singleton instance
export const stripeService = new StripeService();
export default stripeService;