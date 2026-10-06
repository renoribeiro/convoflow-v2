import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Loader2, Plus, TicketPercent } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import { stripeService, type Coupon, type CreateCouponPayload } from '@/services/stripeService';

/**
 * Gerenciador de Cupons (superadmin, aba Cupons do Faturamento).
 *
 * Cada cupom vira dois objetos no Stripe — Coupon (o desconto) e Promotion Code
 * (o texto digitado no Checkout). Como o create-checkout-session já manda
 * `allow_promotion_codes: true`, o cupom passa a funcionar assim que é criado,
 * sem nenhuma outra mudança no fluxo de assinatura.
 *
 * Valores: `discount_value` trafega e é gravado em REAIS. A conversão para
 * centavos acontece só na Edge Function, na chamada ao Stripe.
 */

type DiscountType = 'percent' | 'amount';
type DurationType = 'once' | 'repeating' | 'forever';

interface CouponForm {
  code: string;
  discountType: DiscountType;
  discountValue: string;
  duration: DurationType;
  durationInMonths: string;
  maxUses: string;
  validUntil: Date | undefined;
}

const EMPTY_FORM: CouponForm = {
  code: '',
  discountType: 'percent',
  discountValue: '',
  duration: 'once',
  durationInMonths: '',
  maxUses: '',
  validUntil: undefined,
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const percentFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const formatDiscount = (coupon: Coupon): string => {
  const value = Number(coupon.discount_value) || 0;
  return coupon.discount_type === 'percent'
    ? `${percentFormatter.format(value)}%`
    : currencyFormatter.format(value);
};

const formatDuration = (coupon: Coupon): string => {
  switch (coupon.duration) {
    case 'forever':
      return 'Para sempre';
    case 'repeating': {
      const months = coupon.duration_in_months ?? 0;
      return months === 1 ? '1 mês' : `${months} meses`;
    }
    default:
      // Linhas antigas (antes da migração) não têm `duration` — o default da
      // coluna é 'once', então tratamos igual.
      return 'Uma vez';
  }
};

const formatUses = (coupon: Coupon): string =>
  `${coupon.current_uses ?? 0} / ${coupon.max_uses ?? '∞'}`;

const formatValidUntil = (coupon: Coupon): string =>
  coupon.valid_until ? new Date(coupon.valid_until).toLocaleDateString('pt-BR') : 'Sem limite';

export function CouponManager() {
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [couponToArchive, setCouponToArchive] = useState<Coupon | null>(null);

  const {
    data: coupons = [],
    isLoading,
    isError,
    error: listError,
  } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: () => stripeService.listCoupons(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateCouponPayload) => stripeService.createCoupon(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setFormError(null);
      toast.success('Cupom criado com sucesso!');
    },
    onError: (mutationError: Error) => {
      setFormError(mutationError.message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (coupon: Coupon) =>
      stripeService.archiveCoupon({
        coupon_id: coupon.id,
        stripe_coupon_id: coupon.stripe_coupon_id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      setCouponToArchive(null);
      toast.success('Cupom arquivado.');
    },
    onError: (mutationError: Error) => {
      setCouponToArchive(null);
      toast.error(mutationError.message || 'Não foi possível arquivar o cupom.');
    },
  });

  const openBlankDialog = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  };

  const updateForm = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  /** O Stripe só aceita letras e dígitos no código do Promotion Code. */
  const handleCodeChange = (raw: string) => {
    updateForm('code', raw.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const code = form.code.trim();
    if (!code) {
      setFormError('Informe o código do cupom.');
      return;
    }

    const discountValue = Number(form.discountValue.replace(',', '.'));
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setFormError('Informe um valor de desconto maior que zero.');
      return;
    }
    if (form.discountType === 'percent' && discountValue > 100) {
      setFormError('O desconto percentual não pode passar de 100%.');
      return;
    }

    let durationInMonths: number | null = null;
    if (form.duration === 'repeating') {
      durationInMonths = Number(form.durationInMonths);
      if (!Number.isFinite(durationInMonths) || durationInMonths < 1) {
        setFormError('Informe a quantidade de meses (mínimo 1).');
        return;
      }
    }

    let maxUses: number | null = null;
    if (form.maxUses.trim() !== '') {
      maxUses = Number(form.maxUses);
      if (!Number.isFinite(maxUses) || maxUses < 1) {
        setFormError('O limite de usos deve ser um número maior que zero.');
        return;
      }
    }

    if (form.validUntil && form.validUntil.getTime() <= Date.now()) {
      setFormError('A data de validade precisa ser no futuro.');
      return;
    }

    createMutation.mutate({
      code,
      discount_type: form.discountType,
      discount_value: discountValue,
      duration: form.duration,
      duration_in_months: durationInMonths,
      max_uses: maxUses,
      valid_until: form.validUntil ? form.validUntil.toISOString() : null,
    });
  };

  const isSubmitting = createMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Cabeçalho + ações */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Gerenciador de Cupons</h2>
          <p className="text-sm text-muted-foreground">
            Cupons criados aqui já valem no Checkout do Stripe.
          </p>
        </div>

        <Button
          onClick={openBlankDialog}
          className="bg-success text-success-foreground hover:bg-success/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Cupom
        </Button>
      </div>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {/* Cartão no celular: código lidera, status vira chip, desconto,
              duração, usos e validade viram campos; arquivar fica no canto. */}
          <ResponsiveTable
            ariaLabel="Cupons"
            rows={coupons}
            rowKey={(coupon) => coupon.id}
            loading={isLoading}
            error={isError ? ((listError as Error)?.message || 'Não foi possível carregar os cupons.') : undefined}
            empty={
              <>
                <TicketPercent className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Nenhum cupom cadastrado ainda.
              </>
            }
            actionsHeader="Ações"
            columns={[
              {
                key: 'codigo',
                header: 'Código',
                card: 'title',
                cell: (coupon) => (
                  <Badge variant="outline" className="font-mono tracking-wide">
                    {coupon.code}
                  </Badge>
                ),
              },
              { key: 'desconto', header: 'Desconto', cellClassName: 'font-medium', cell: formatDiscount },
              { key: 'duracao', header: 'Duração', cell: formatDuration },
              { key: 'usos', header: 'Usos', cellClassName: 'tabular-nums', cell: formatUses },
              { key: 'validade', header: 'Validade', cell: formatValidUntil },
              {
                key: 'status',
                header: 'Status',
                card: 'badge',
                cell: (coupon) =>
                  coupon.is_active ? (
                    <Badge className="border-transparent bg-success text-success-foreground hover:bg-success/90">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Arquivado</Badge>
                  ),
              },
            ]}
            actions={(coupon) =>
              coupon.is_active ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Arquivar cupom ${coupon.code}`}
                  title="Arquivar cupom"
                  onClick={() => setCouponToArchive(coupon)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )
            }
          />
        </CardContent>
      </Card>

      {/* Dialog: novo cupom */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (isSubmitting) return;
          setDialogOpen(open);
          if (!open) setFormError(null);
        }}
      >
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <AnimatePresence initial={false}>
            <motion.div
              key="coupon-form"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-4"
            >
              <DialogHeader>
                <DialogTitle>Novo Cupom</DialogTitle>
                <DialogDescription>
                  O código é criado no Stripe e fica disponível no Checkout na hora.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="coupon-code">Código do cupom</Label>
                  <Input
                    id="coupon-code"
                    value={form.code}
                    onChange={(event) => handleCodeChange(event.target.value)}
                    placeholder="EXEMPLO20"
                    autoComplete="off"
                    className="font-mono uppercase tracking-wide"
                    maxLength={40}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Somente letras e números. O código é convertido para maiúsculas automaticamente.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="coupon-discount-type">Tipo de desconto</Label>
                    <Select
                      value={form.discountType}
                      onValueChange={(value: DiscountType) => updateForm('discountType', value)}
                    >
                      <SelectTrigger id="coupon-discount-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percentual (%)</SelectItem>
                        <SelectItem value="amount">Valor fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coupon-discount-value">
                      {form.discountType === 'percent' ? 'Valor do desconto (%)' : 'Valor do desconto (R$)'}
                    </Label>
                    <Input
                      id="coupon-discount-value"
                      type="number"
                      inputMode="decimal"
                      min={form.discountType === 'percent' ? 1 : 0.01}
                      max={form.discountType === 'percent' ? 100 : undefined}
                      step={form.discountType === 'percent' ? 1 : 0.01}
                      value={form.discountValue}
                      onChange={(event) => updateForm('discountValue', event.target.value)}
                      placeholder={form.discountType === 'percent' ? '20' : '30,00'}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="coupon-duration">Duração</Label>
                    <Select
                      value={form.duration}
                      onValueChange={(value: DurationType) => updateForm('duration', value)}
                    >
                      <SelectTrigger id="coupon-duration">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">Uma vez</SelectItem>
                        <SelectItem value="repeating">Meses recorrentes</SelectItem>
                        <SelectItem value="forever">Para sempre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {form.duration === 'repeating' && (
                    <div className="space-y-2">
                      <Label htmlFor="coupon-duration-months">Quantidade de meses</Label>
                      <Input
                        id="coupon-duration-months"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={form.durationInMonths}
                        onChange={(event) => updateForm('durationInMonths', event.target.value)}
                        placeholder="2"
                        required
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coupon-max-uses">Limite de usos</Label>
                  <Input
                    id="coupon-max-uses"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={form.maxUses}
                    onChange={(event) => updateForm('maxUses', event.target.value)}
                    placeholder="Deixe em branco para ilimitado"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Válido até</Label>
                  <div className="flex items-center gap-2">
                    <DatePicker
                      date={form.validUntil}
                      onDateChange={(date) => updateForm('validUntil', date)}
                      placeholder="Sem data de expiração"
                    />
                    {form.validUntil && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateForm('validUntil', undefined)}
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                </div>

                {formError && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {formError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-success text-success-foreground hover:bg-success/90"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      'Criar Cupom'
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* Confirmação de arquivamento */}
      <AlertDialog
        open={!!couponToArchive}
        onOpenChange={(open) => {
          if (!open && !archiveMutation.isPending) setCouponToArchive(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar o cupom {couponToArchive?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              O código deixa de ser aceito no Checkout imediatamente e não pode ser reativado.
              Quem já assinou usando o cupom continua com o desconto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (couponToArchive) archiveMutation.mutate(couponToArchive);
              }}
            >
              {archiveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Arquivando...
                </>
              ) : (
                'Arquivar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CouponManager;
