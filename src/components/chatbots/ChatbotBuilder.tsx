import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Bot, 
  Plus, 
  X, 
  MessageSquare, 
  Zap, 
  Save,
  Eye,
  Play,
  ArrowRight
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ChatbotBuilderProps {
  botId?: string | null;
  onSave: () => void;
}

interface BotTrigger {
  id: string;
  phrase: string;
}

interface BotResponse {
  id: string;
  message: string;
  variables: string[];
}

export const ChatbotBuilder = ({ botId, onSave }: ChatbotBuilderProps) => {
  const [botData, setBotData] = useState({
    name: '',
    description: '',
    type: 'simple' as 'simple' | 'flow',
    isActive: true
  });

  const [triggers, setTriggers] = useState<BotTrigger[]>([
    { id: '1', phrase: '' }
  ]);

  const [responses, setResponses] = useState<BotResponse[]>([
    { id: '1', message: '', variables: [] }
  ]);

  const [newTrigger, setNewTrigger] = useState('');
  const [preview, setPreview] = useState(false);

  const addTrigger = () => {
    if (newTrigger.trim()) {
      setTriggers(prev => [...prev, { 
        id: Date.now().toString(), 
        phrase: newTrigger.trim() 
      }]);
      setNewTrigger('');
    }
  };

  const removeTrigger = (id: string) => {
    setTriggers(prev => prev.filter(t => t.id !== id));
  };

  const addResponse = () => {
    setResponses(prev => [...prev, {
      id: Date.now().toString(),
      message: '',
      variables: []
    }]);
  };

  const updateResponse = (id: string, message: string) => {
    setResponses(prev => prev.map(r => 
      r.id === id ? { ...r, message, variables: extractVariables(message) } : r
    ));
  };

  const removeResponse = (id: string) => {
    if (responses.length > 1) {
      setResponses(prev => prev.filter(r => r.id !== id));
    }
  };

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{([^}]+)\}\}/g);
    return matches ? matches.map(match => match.slice(2, -2)) : [];
  };

  const handleSave = () => {
    console.log('Saving chatbot:', { botData, triggers, responses });
    onSave();
  };

  const testBot = () => {
    console.log('Testing chatbot with current configuration');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/15 text-accent rounded-lg">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>
                  {botId === 'new' ? 'Novo Chatbot' : 'Editar Chatbot'}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Configure gatilhos e respostas automáticas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={testBot}>
                <Play className="w-4 h-4 mr-2" />
                Testar
              </Button>
              <Button variant="outline" onClick={() => setPreview(!preview)}>
                <Eye className="w-4 h-4 mr-2" />
                {preview ? 'Ocultar' : 'Preview'}
              </Button>
              <Button onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" />
                Salvar
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="basic" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Configurações</TabsTrigger>
              <TabsTrigger value="triggers">Gatilhos</TabsTrigger>
              <TabsTrigger value="responses">Respostas</TabsTrigger>
            </TabsList>

            <TabsContent value="basic">
              <Card>
                <CardHeader>
                  <CardTitle>Configurações Básicas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="bot-name">Nome do Chatbot</Label>
                    <Input
                      id="bot-name"
                      value={botData.name}
                      onChange={(e) => setBotData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Atendimento Inicial"
                    />
                  </div>

                  <div>
                    <Label htmlFor="bot-description">Descrição</Label>
                    <Textarea
                      id="bot-description"
                      value={botData.description}
                      onChange={(e) => setBotData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descreva o propósito deste chatbot"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label>Tipo de Chatbot</Label>
                    <Select value={botData.type} onValueChange={(value: 'simple' | 'flow') => setBotData(prev => ({ ...prev, type: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simples (palavra-chave → resposta)</SelectItem>
                        <SelectItem value="flow">Fluxo (sequência de interações)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Status do Chatbot</Label>
                      <p className="text-sm text-muted-foreground">
                        {botData.isActive ? 'Ativo - responderá automaticamente' : 'Inativo - não responderá'}
                      </p>
                    </div>
                    <Switch
                      checked={botData.isActive}
                      onCheckedChange={(checked) => setBotData(prev => ({ ...prev, isActive: checked }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="triggers">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Gatilhos (Palavras-chave)
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Configure as palavras ou frases que ativam este chatbot
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={newTrigger}
                      onChange={(e) => setNewTrigger(e.target.value)}
                      placeholder="Digite uma palavra-chave..."
                      onKeyPress={(e) => e.key === 'Enter' && addTrigger()}
                    />
                    <Button onClick={addTrigger}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {triggers.map((trigger, index) => (
                      <div key={trigger.id} className="flex items-center gap-2 p-3 border rounded-lg">
                        <Badge variant="outline">{index + 1}</Badge>
                        <Input
                          value={trigger.phrase}
                          onChange={(e) => setTriggers(prev => 
                            prev.map(t => t.id === trigger.id ? { ...t, phrase: e.target.value } : t)
                          )}
                          placeholder="Palavra-chave..."
                        />
                        {triggers.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => removeTrigger(trigger.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button variant="outline" onClick={() => setTriggers(prev => [...prev, { id: Date.now().toString(), phrase: '' }])}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Gatilho
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="responses">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Respostas Automáticas
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Configure as mensagens que serão enviadas automaticamente. Use variáveis como {`{{nome}}`}, {`{{telefone}}`}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {responses.map((response, index) => (
                    <div key={response.id} className="space-y-3 p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">Resposta {index + 1}</Badge>
                        {responses.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => removeResponse(response.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      <Textarea
                        value={response.message}
                        onChange={(e) => updateResponse(response.id, e.target.value)}
                        placeholder="Digite a mensagem de resposta..."
                        rows={4}
                      />

                      {response.variables.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            VARIÁVEIS DETECTADAS:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {response.variables.map((variable, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {`{{${variable}}}`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <Button variant="outline" onClick={addResponse}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Resposta
                  </Button>

                  <div className="p-4 bg-status-info/10 rounded-lg">
                    <h4 className="font-medium text-foreground mb-2">Dicas para Variáveis</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Use {`{{nome}}`} para o nome do contato</li>
                      <li>• Use {`{{telefone}}`} para o número do WhatsApp</li>
                      <li>• Use {`{{empresa}}`} para o nome da sua empresa</li>
                      <li>• Variáveis serão substituídas automaticamente</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          {preview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Preview do Chatbot</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {triggers.filter(t => t.phrase).map((trigger, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-end">
                        <div className="bg-accent/15 text-accent-foreground px-3 py-2 rounded-lg max-w-xs text-sm">
                          {trigger.phrase}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <div className="bg-muted px-3 py-2 rounded-lg max-w-xs text-sm">
                          {responses[0]?.message.replace(/\{\{([^}]+)\}\}/g, '[VAR: $1]') || 'Sem resposta configurada'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Resumo da Configuração</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">NOME</p>
                <p className="text-sm">{botData.name || 'Não definido'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">TIPO</p>
                <Badge variant="outline">
                  {botData.type === 'simple' ? 'Simples' : 'Fluxo'}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">GATILHOS</p>
                <p className="text-sm">{triggers.filter(t => t.phrase).length} configurados</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">RESPOSTAS</p>
                <p className="text-sm">{responses.filter(r => r.message).length} configuradas</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">STATUS</p>
                <Badge variant={botData.isActive ? 'default' : 'secondary'}>
                  {botData.isActive ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};