import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TAG_PALETTE } from '@/lib/chartColors';

/** Paleta padrão de cores de etiqueta — derivada de TAG_PALETTE (marca ConvoFlow). */
export const TAG_COLORS = TAG_PALETTE;

const HEX_RE = /^#([0-9a-f]{6})$/i;

export const isValidHex = (value: string) => HEX_RE.test(value.trim());

interface ColorPaletteInputProps {
  value: string;
  onChange: (color: string) => void;
}

/**
 * Seletor de cor leve: grade de cores pré-definidas + campo hex custom.
 * Sem dependência externa. O hex só é propagado quando válido (#RRGGBB).
 */
export const ColorPaletteInput = ({ value, onChange }: ColorPaletteInputProps) => {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {TAG_COLORS.map((color) => {
          const selected = value.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              aria-label={`Selecionar cor ${color}`}
              onClick={() => onChange(color)}
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110',
                selected && 'ring-2 ring-offset-2 ring-ring',
              )}
              style={{ backgroundColor: color }}
            >
              {selected && <Check className="h-4 w-4 text-white" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-7 w-7 rounded-md border shrink-0"
          style={{ backgroundColor: isValidHex(value) ? value : 'transparent' }}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#3B82F6"
          maxLength={7}
          className="font-mono uppercase"
        />
      </div>
    </div>
  );
};
