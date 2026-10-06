
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Bot, MessageCircle, Phone, Mail, ShoppingCart } from 'lucide-react';

interface NewChatbotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const templates = [
  {
    id: 'general',
    name: 'Atendimento Geral',
    description: 'Para atendimento ao cliente básico e FAQ',
    icon: MessageCircle,
    features: ['FAQ Automático', 'Horário de Funcionamento', 'Transferência Humana']
  },
  {
    id: 'sales',
    name: 'Vendas',
    description: 'Foco em conversão e qualificação de leads',
    icon: ShoppingCart,
    features: ['Qualificação de Leads', 'Catálogo de Produtos', 'Carrinho de Compras']
  },
  {
    id: 'support',
    name: 'Suporte Técnico',
    description: 'Para resolver problemas técnicos específicos',
    icon: Phone,
    features: ['Diagnóstico Automatizado', 'Base de Conhecimento', 'Escalação Técnica']
  },
  {
    id: 'custom',
    name: 'Personalizado',
    description: 'Crie do zero com suas próprias regras',
    icon: Bot,
    features: ['Totalmente Customizável', 'Fluxos Próprios', 'Integrações Avançadas']
  }
];

export const NewChatbotModal = ({ isOpen, onClose }: NewChatbotModalProps) => {
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [chatbotName, setChatbotName] = useState('');
  const [chatbotDescription, setChatbotDescription] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setChatbotName(template.name);
      setChatbotDescription(template.description);
      setWelcomeMessage(getDefaultWelcomeMessage(templateId));
    }
  };

  const getDefaultWelcomeMessage = (templateId: string) => {
    switch (templateId) {
      case 'general':
        return 'Olá! 👋 Sou o assistente virtual. Como posso te ajudar hoje?';
      case 'sales':
        return 'Bem-vindo! 🛍️ Estou aqui para te ajudar com nossos produtos. O que você está procurando?';
      case 'support':
        return 'Olá! 🔧 Sou o suporte técnico. Descreva seu problema que vou te ajudar a resolver.';
      case 'custom':
        return 'Olá! Como posso ajudar você hoje?';
      default:
        return '';
    }
  };

  const handleCreate = () => {
    console.log('Creating chatbot:', {
      name: chatbotName,
      description: chatbotDescription,
      template: selectedTemplate,
      welcomeMessage
    });
    onClose();
    setStep(1);
    setSelectedTemplate(null);
    setChatbotName('');
    setChatbotDescription('');
    setWelcomeMessage('');
  };

  const canProceed = step === 1 ? selectedTemplate : chatbotName && welcomeMessage;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Criar Novo Chatbot - {step === 1 ? 'Escolher Template' : 'Configuração'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6">
            <p className="text-muted-foreground">
              Escolha um template para começar ou crie um chatbot personalizado do zero.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => {
                const Icon = template.icon;
                return (
                  <Card
                    key={template.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedTemplate === template.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Icon className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {template.description}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {template.features.map((feature) => (
                          <Badge key={feature} variant="secondary" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="chatbot-name">Nome do Chatbot</Label>
                  <Input
                    id="chatbot-name"
                    value={chatbotName}
                    onChange={(e) => setChatbotName(e.target.value)}
                    placeholder="Ex: Assistente de Vendas"
                  />
                </div>

                <div>
                  <Label htmlFor="chatbot-description">Descrição</Label>
                  <Textarea
                    id="chatbot-description"
                    value={chatbotDescription}
                    onChange={(e) => setChatbotDescription(e.target.value)}
                    placeholder="Descreva o propósito deste chatbot..."
                  />
                </div>

                <div>
                  <Label htmlFor="welcome-message">Mensagem de Boas-vindas</Label>
                  <Textarea
                    id="welcome-message"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="A primeira mensagem que o usuário verá..."
                  />
                </div>
              </div>

              <div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="font-medium">{chatbotName || 'Nome do Chatbot'}</p>
                        <p className="text-sm text-muted-foreground">
                          {chatbotDescription || 'Descrição do chatbot...'}
                        </p>
                      </div>
                      
                      <div className="border rounded-lg p-3 bg-primary/5">
                        <div className="flex items-start gap-2">
                          <Bot className="w-6 h-6 text-primary mt-1" />
                          <div className="bg-white rounded-lg p-2 shadow-sm flex-1">
                            <p className="text-sm">
                              {welcomeMessage || 'Mensagem de boas-vindas aparecerá aqui...'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <div>
            {step === 2 && (
              <Button variant="outline" onClick={() => setStep(1)}>
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            {step === 1 ? (
              <Button
                onClick={() => setStep(2)}
                disabled={!canProceed}
              >
                Próximo
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={!canProceed}
              >
                Criar Chatbot
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
