// Tipos da regra cores/sem-cor-fixa, para o teste em src/lib/cores/semCorFixa.test.ts.
export interface CorAchada {
  tipo: string;
  valor: string;
  indice: number;
}
export function acharCores(texto: string): CorAchada[];
declare const plugin: { rules: Record<string, unknown> };
export default plugin;
