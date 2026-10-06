
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { X, Search } from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';

interface ContactFiltersProps {
  filters: {
    search: string;
    stage: string;
    source: string;
    tags: string[];
  };
  onFiltersChange: (filters: any) => void;
  /** A Loja tem Instagram: a busca também acha pelo @ e o placeholder diz isso. */
  searchByHandle?: boolean;
}



export const ContactFilters = ({ filters, onFiltersChange, searchByHandle = false }: ContactFiltersProps) => {
  const { data: stages = [], isLoading: stagesLoading } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['funnel-stages'],
    select: 'id, name, color',
    orderBy: [{ column: 'order', ascending: true }],
    staleTime: 5 * 60 * 1000 // 5 minutos
  });

  const { data: sourcesData = [], isLoading: sourcesLoading } = useSupabaseQuery({
    table: 'lead_sources',
    queryKey: ['lead-sources'],
    select: 'id, name',
    staleTime: 5 * 60 * 1000
  });

  const { data: tagsData = [], isLoading: tagsLoading } = useSupabaseQuery({
    table: 'tags',
    queryKey: ['tags'],
    select: 'id, name, color',
    orderBy: [{ column: 'name', ascending: true }],
    staleTime: 5 * 60 * 1000
  });

  // Processar dados para obter valores únicos
  const sources = sourcesData || [];
  const availableTags = (tagsData || []).map(tag => ({ id: tag.id, name: tag.name, color: tag.color }));

  const updateFilters = (key: string, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const addTag = (tagId: string) => {
    if (!filters.tags.includes(tagId)) {
      updateFilters('tags', [...filters.tags, tagId]);
    }
  };

  const removeTag = (tagId: string) => {
    updateFilters('tags', filters.tags.filter(t => t !== tagId));
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      stage: '',
      source: '',
      tags: []
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Filtros
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="search">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              id="search"
              placeholder={searchByHandle ? 'Nome, telefone ou @...' : 'Nome ou telefone...'}
              value={filters.search}
              onChange={(e) => updateFilters('search', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <Label>Estágio do Funil</Label>
          {stagesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={filters.stage || 'all'} onValueChange={(value) => updateFilters('stage', value === 'all' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os estágios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estágios</SelectItem>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
          )}
        </div>

        <div>
          <Label>Fonte do Lead</Label>
          {sourcesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={filters.source || 'all'} onValueChange={(value) => updateFilters('source', value === 'all' ? '' : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as fontes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as fontes</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div>
          <Label>Etiquetas</Label>
          {tagsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <div className="flex gap-1">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-14" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {filters.tags.map((tagId) => {
                  const tag = availableTags.find(t => t.id === tagId);
                  return tag ? (
                    <Badge key={tagId} variant="default" className="text-xs" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                      <button onClick={() => removeTag(tagId)} className="ml-1">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap gap-1">
                {availableTags.filter(tag => !filters.tags.includes(tag.id)).map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => addTag(tag.id)}
                    style={{ borderColor: tag.color, color: tag.color }}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
