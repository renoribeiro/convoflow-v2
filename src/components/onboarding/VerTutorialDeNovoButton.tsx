/**
 * "Ver tutorial de novo", no topo da Ajuda: zera o estado do onboarding da
 * pessoa (user_onboarding.state = {}) e leva ao Dashboard, onde a boas-vindas
 * e a lista "Primeiros passos" voltam. Superadmin não tem onboarding: o botão
 * não aparece para ele.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useOnboardingState } from '@/hooks/useOnboarding';

export function VerTutorialDeNovoButton() {
  const { enabled, reset } = useOnboardingState();
  const navigate = useNavigate();
  const [ocupado, setOcupado] = useState(false);

  if (!enabled) return null;

  const recomecar = async () => {
    setOcupado(true);
    const ok = await reset();
    setOcupado(false);
    if (ok) {
      toast.success('Pronto! O tutorial recomeça no Dashboard.');
      navigate('/dashboard');
    } else {
      toast.error('Não deu para recomeçar agora. Tente de novo em instantes.');
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={recomecar} disabled={ocupado}>
      <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
      Ver tutorial de novo
    </Button>
  );
}

export default VerTutorialDeNovoButton;
