import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Lote 5 do checkup: toda janela tem UM botão de fechar, o "X" que o próprio
 * DialogContent/SheetContent desenha (src/components/ui/dialog.tsx). A janela
 * "Novo Relatório" tinha um segundo "X" no cabeçalho. Este teste varre o src/
 * atrás de um ícone X dentro de <DialogHeader> ou <SheetHeader>.
 */
function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [p] : [];
  });
}

describe('janelas com um botão de fechar só', () => {
  it('nenhum cabeçalho de janela desenha outro "X"', () => {
    const raiz = path.resolve(__dirname, '../..');
    const achados: string[] = [];
    for (const arq of arquivos(raiz)) {
      const src = fs.readFileSync(arq, 'utf8');
      for (const m of src.matchAll(/<(Dialog|Sheet)Header[^>]*>([\s\S]*?)<\/\1Header>/g)) {
        if (/<X\b|<XIcon\b|<XCircle\b/.test(m[2] ?? '')) achados.push(path.relative(raiz, arq));
      }
    }
    expect(achados).toEqual([]);
  });

  it('o botão de fechar padrão se chama "Fechar janela"', () => {
    for (const arq of ['dialog.tsx', 'sheet.tsx']) {
      const src = fs.readFileSync(path.join(__dirname, arq), 'utf8');
      expect(src).toContain('<span className="sr-only">Fechar janela</span>');
      expect(src).not.toContain('>Close<');
    }
  });
});
