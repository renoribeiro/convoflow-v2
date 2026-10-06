import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSupabaseQuerySingle } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';
import { Camera, Save } from 'lucide-react';
import { FeatureHelp } from '@/components/shared/FeatureHelp';

export function ProfileSettings() {
  const { user } = useAuth();
  const { refreshTenant } = useTenant();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Buscar dados do perfil (um único registro) somente quando houver usuário
  const { data: profile, isLoading, refetch } = useSupabaseQuerySingle({
    table: 'profiles',
    select: '*',
    filters: [{ column: 'user_id', operator: 'eq', value: user?.id }],
    enabled: !!user?.id,
  });

  // Mutação para atualizar perfil
  const updateProfileMutation = useSupabaseMutation({
    table: 'profiles',
    operation: 'update',
    onSuccess: () => {
      toast.success('Perfil atualizado com sucesso!');
      // Recarregar dados do formulário e do cabeçalho
      refetch();
      refreshTenant();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar perfil: ' + error.message);
    }
  });

  // Preencher campos quando os dados do perfil carregarem
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      // Email vem do Auth e é somente leitura aqui
      setEmail(user?.email || '');
      setPhone(profile.phone || '');
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile, user?.email]);

  const handleSave = () => {
    if (!user?.id) return;

    updateProfileMutation.mutate({
      // Enviar somente campos existentes na tabela profiles
      data: {
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        bio: bio,
        avatar_url: avatarUrl,
      },
      // Atualizar apenas o registro do usuário logado
      options: {
        filter: { column: 'user_id', operator: 'eq', value: user.id }
      }
    });
  };

  const getInitials = () => {
    const f = firstName?.trim()?.charAt(0) || '';
    const l = lastName?.trim()?.charAt(0) || '';
    const initials = `${f}${l}`.toUpperCase();
    return initials || 'U';
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tamanho do arquivo (máximo 1MB)
      if (file.size > 1024 * 1024) {
        toast.error('Arquivo muito grande. Máximo 1MB.');
        return;
      }

      // Validar tipo do arquivo
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor, selecione uma imagem válida.');
        return;
      }

      // Criar URL temporária para preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarUrl(e.target?.result as string);
        toast.success('Imagem carregada! Clique em "Salvar Alterações" para confirmar.');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Carregando informações do perfil...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        {/* A ajuda mora aqui (e não na aba de Configurações) porque este mesmo
            componente atende a aba "Perfil" e a rota /dashboard/profile. */}
        <div className="flex items-center gap-1.5">
          <CardTitle>Perfil</CardTitle>
          <FeatureHelp helpKey="page:settings-profile" />
        </div>
        <CardDescription>
          Gerencie suas informações pessoais e preferências de conta
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar Section */}
        <div className="flex items-center space-x-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={avatarUrl} alt="Avatar" />
            <AvatarFallback className="text-lg">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={handleAvatarClick}>
              <Camera className="h-4 w-4 mr-2" />
              Alterar Foto
            </Button>
            <p className="text-sm text-muted-foreground">
              JPG, GIF ou PNG. Máximo 1MB.
            </p>
          </div>
        </div>

        {/* Personal Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nome</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Sobrenome</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Seu sobrenome"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            disabled
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Conte um pouco sobre você..."
            rows={3}
          />
        </div>

        <div className="flex justify-end">
          <Button 
            onClick={handleSave}
            disabled={updateProfileMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {updateProfileMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}