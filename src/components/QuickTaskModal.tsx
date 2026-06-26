import { useEffect, useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useTasksStore, todayKey, allClients, allTags } from '@/stores/tasks';
import { TaskTextInput } from './TasksPane';
import { toast } from '@/stores/toasts';

/** Adição rápida de tarefa, acionável de qualquer lugar (Ctrl+Shift+A). */
export function QuickTaskModal({ onClose }: { onClose: () => void }) {
  const add = useTasksStore((s) => s.add);
  const tasks = useTasksStore((s) => s.tasks);
  const clients = useMemo(() => allClients(tasks), [tasks]);
  const tags = useMemo(() => allTags(tasks), [tasks]);
  const [text, setText] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit() {
    if (!text.trim()) return;
    add(text, todayKey());
    toast.success('Tarefa adicionada', 'Para hoje');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center bg-black/50 p-6 pt-[14vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
          <ListChecks size={14} className="text-accent" />
          <span className="text-[13px] font-bold text-text-primary">Nova tarefa</span>
          <span className="ml-auto text-[10px] text-text-muted">Enter adiciona · Esc fecha</span>
        </div>
        <div className="p-3">
          <TaskTextInput
            value={text}
            onChange={setText}
            onSubmit={submit}
            onEscape={onClose}
            clients={clients}
            tags={tags}
            autoFocus
            placeholder="Tarefa para hoje…  #tag  @cliente  !p1"
          />
          <p className="mt-2 px-0.5 text-[10.5px] text-text-muted">
            Use <span className="font-mono text-text-tertiary">#tag</span>, <span className="font-mono text-text-tertiary">@cliente</span> e <span className="font-mono text-text-tertiary">!p1</span> direto no texto.
          </p>
        </div>
      </div>
    </div>
  );
}
