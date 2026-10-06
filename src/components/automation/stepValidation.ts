/**
 * Validação derivada (UI-only) de completude de uma etapa/gatilho, a partir do
 * catálogo. Não altera dados — só calcula "Configurado ✓" vs "Incompleto ⚠"
 * e quais campos obrigatórios faltam (para borda vermelha + selo no card).
 */
import { getCatalogEntry, type CatalogEntry } from './automationCatalog';

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export interface StepValidation {
  complete: boolean;
  /** rótulos dos campos obrigatórios vazios */
  missing: string[];
  /** chaves dos campos obrigatórios vazios (para destacar inputs) */
  missingKeys: string[];
}

export function validateConfig(entry: CatalogEntry | undefined, config: Record<string, unknown>): StepValidation {
  if (!entry) return { complete: false, missing: [], missingKeys: [] };

  const cfg = config ?? {};
  const missing: string[] = [];
  const missingKeys: string[] = [];

  for (const f of entry.fields) {
    if (f.required && isEmptyValue(cfg[f.key])) {
      missing.push(f.label);
      missingKeys.push(f.key);
    }
  }

  // Regra especial: "Atualizar Contato" com campo personalizado exige a chave.
  if (entry.key === 'update_contact' && cfg.field === 'custom' && isEmptyValue(cfg.custom_key)) {
    missing.push('Nome do campo personalizado');
    missingKeys.push('custom_key');
  }

  return { complete: missing.length === 0, missing, missingKeys };
}

/** Conveniência: valida uma etapa do fluxo (usa config.type como subtipo). */
export function validateStep(step: { config?: Record<string, unknown> }): StepValidation {
  const cfg = step?.config ?? {};
  const entry = getCatalogEntry(cfg.type as string);
  if (!entry) {
    // etapa criada mas tipo ainda não escolhido
    return { complete: false, missing: ['Tipo da etapa'], missingKeys: ['type'] };
  }
  return validateConfig(entry, cfg);
}
