
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

export const AppearanceSettings = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Simular salvamento das preferências
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Aqui você salvaria as preferências no backend
      const preferences = {
        darkMode,
        compactMode
      };
      
      console.log('Salvando preferências de aparência:', preferences);
      
      // Aplicar tema escuro se habilitado
      if (darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      
      // Aplicar modo compacto se habilitado
      if (compactMode) {
        document.documentElement.classList.add('compact');
      } else {
        document.documentElement.classList.remove('compact');
      }
      
      toast.success('Preferências de aparência salvas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar preferências. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aparência</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="darkMode">Modo Escuro</Label>
            <p className="text-sm text-muted-foreground">
              Alternar entre tema claro e escuro
            </p>
          </div>
          <Switch 
            id="darkMode" 
            checked={darkMode}
            onCheckedChange={setDarkMode}
          />
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="compactMode">Modo Compacto</Label>
            <p className="text-sm text-muted-foreground">
              Reduzir espaçamento para melhor aproveitamento
            </p>
          </div>
          <Switch 
            id="compactMode" 
            checked={compactMode}
            onCheckedChange={setCompactMode}
          />
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar Preferências'}
        </Button>
      </CardContent>
    </Card>
  );
};
