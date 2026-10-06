import React, { useRef, useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import VariableChips from './VariableChips';
import type { ShowOptionsNodeData, ShowOptionsOption, ChatbotVariableRow } from '@/types/chatbot-flow.types';

interface Props {
  data: ShowOptionsNodeData;
  variables: ChatbotVariableRow[];
  onChange: (patch: Partial<ShowOptionsNodeData>) => void;
}

interface SortableOptionProps {
  option: ShowOptionsOption;
  onUpdate: (id: string, field: keyof ShowOptionsOption, value: string) => void;
  onRemove: (id: string) => void;
}

const SortableOption: React.FC<SortableOptionProps> = ({ option, onUpdate, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: option.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 py-1">
      <button {...attributes} {...listeners} className="mt-2 cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 space-y-1">
        <Input
          value={option.label}
          onChange={(e) => onUpdate(option.id, 'label', e.target.value)}
          placeholder="Rótulo exibido"
          className="h-7 text-xs"
        />
        <Input
          value={option.value}
          onChange={(e) => onUpdate(option.id, 'value', e.target.value)}
          placeholder="Valor interno"
          className="h-7 text-xs"
        />
      </div>
      <button
        onClick={() => onRemove(option.id)}
        className="mt-2 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
};

const ShowOptionsPanel: React.FC<Props> = ({ data, variables, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const validate = (d: ShowOptionsNodeData) => {
    const r = validateNodeData('show_options', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const emit = (patch: Partial<ShowOptionsNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  const addOption = () => {
    if ((data.options ?? []).length >= 10) return;
    const id = crypto.randomUUID();
    emit({ options: [...(data.options ?? []), { id, label: '', value: '' }] });
  };

  const removeOption = (id: string) => {
    emit({ options: data.options.filter((o) => o.id !== id) });
  };

  const updateOption = (id: string, field: keyof ShowOptionsOption, value: string) => {
    emit({
      options: data.options.map((o) => (o.id === id ? { ...o, [field]: value } : o)),
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = data.options.findIndex((o) => o.id === active.id);
      const newIndex = data.options.findIndex((o) => o.id === over.id);
      emit({ options: arrayMove(data.options, oldIndex, newIndex) });
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Mensagem do menu *</Label>
        <Textarea
          ref={textareaRef}
          value={data.message}
          onChange={(e) => emit({ message: e.target.value })}
          placeholder="Escolha uma opção:"
          rows={3}
          className={errors.message ? 'border-destructive' : ''}
        />
        {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
      </div>

      <VariableChips
        variables={variables}
        textareaRef={textareaRef}
        currentValue={data.message}
        onInsert={(v) => emit({ message: v })}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Opções *</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOption}
            disabled={(data.options ?? []).length >= 10}
          >
            <Plus className="h-3 w-3 mr-1" />
            Adicionar
          </Button>
        </div>
        {errors.options && <p className="text-xs text-destructive">{errors.options}</p>}

        {(data.options ?? []).length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={data.options.map((o) => o.id)}
              strategy={verticalListSortingStrategy}
            >
              {data.options.map((opt) => (
                <SortableOption
                  key={opt.id}
                  option={opt}
                  onUpdate={updateOption}
                  onRemove={removeOption}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <p className="text-xs text-muted-foreground italic text-center py-2">
            Nenhuma opção adicionada
          </p>
        )}
      </div>
    </div>
  );
};

export default ShowOptionsPanel;
