import { PageHeader } from '@/components/shared/PageHeader';
import { ProfileSettings } from '@/components/settings/profilesettings';

export default function Profile() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meu Perfil"
        description="Gerencie suas informações pessoais e configurações de conta"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Meu Perfil' }
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <ProfileSettings />
        </div>
      </div>
    </div>
  );
}
