import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface NotificationPrefs {
  newMessages: boolean;
  followups: boolean;
  campaigns: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  newMessages: true,
  followups: true,
  campaigns: false,
};

export const NotificationSettings = () => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Carrega as preferências salvas (profiles.notification_prefs).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const saved = (data?.notification_prefs ?? {}) as Partial<NotificationPrefs>;
      setPrefs({ ...DEFAULT_PREFS, ...saved });
      setIsLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const setPref = (key: keyof NotificationPrefs) => (value: boolean) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ notification_prefs: prefs as unknown as Record<string, boolean> })
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Preferências de notificação salvas com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar preferências: ' + (error?.message ?? 'tente novamente.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preferências de Notificação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências de Notificação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="newMessages">Novas Mensagens</Label>
            <p className="text-sm text-muted-foreground">
              Receber notificações quando chegarem novas mensagens
            </p>
          </div>
          <Switch
            id="newMessages"
            checked={prefs.newMessages}
            onCheckedChange={setPref('newMessages')}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="followups">Follow-ups</Label>
            <p className="text-sm text-muted-foreground">
              Lembrar sobre tarefas de follow-up pendentes
            </p>
          </div>
          <Switch
            id="followups"
            checked={prefs.followups}
            onCheckedChange={setPref('followups')}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="campaigns">Campanhas</Label>
            <p className="text-sm text-muted-foreground">
              Notificações sobre status de campanhas
            </p>
          </div>
          <Switch
            id="campaigns"
            checked={prefs.campaigns}
            onCheckedChange={setPref('campaigns')}
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
