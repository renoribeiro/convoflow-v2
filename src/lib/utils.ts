import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

/**
 * Formata para exibição um telefone brasileiro guardado só com dígitos.
 * `5585999990202` → `+55 (85) 99999-0202`.
 *
 * Devolve a entrada intacta quando não reconhece o formato (número
 * internacional, curto, já formatado), para nunca esconder o dado real.
 */
export function formatPhoneBR(phone?: string | null): string {
  if (!phone) return ''

  const digits = phone.replace(/\D/g, '')
  const temPais = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
  const nacional = temPais ? digits.slice(2) : digits
  const prefixo = temPais ? '+55 ' : ''

  if (nacional.length === 11) {
    return `${prefixo}(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`
  }
  if (nacional.length === 10) {
    return `${prefixo}(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`
  }
  return phone
}
