import { useEffect } from 'react';
import { TasksView } from './TasksPane';

/** Gerenciador de tarefas em modal dedicado e espaçoso (produtividade do dia-a-dia). */
export function TasksModal({ onClose, onTogglePip, pipActive }: {
  onClose: () => void;
  onTogglePip: () => void;
  pipActive: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-6 pt-[5vh]" onClick={onClose}>
      <div
        className="cmd-enter flex h-[84vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-base shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <TasksView pipActive={pipActive} onTogglePip={onTogglePip} onClose={onClose} />
      </div>
    </div>
  );
}
