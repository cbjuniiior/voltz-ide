import { useEffect } from 'react';
import { AnalyticsDashboard } from './AnalyticsDashboard';

/** Painel de produtividade (Analytics) em modal grande e dedicado. */
export function AnalyticsModal({ onClose, onOpenPalette }: {
  onClose: () => void;
  onOpenPalette: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-6 pt-[4vh]" onClick={onClose}>
      <div
        className="cmd-enter flex h-[88vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-base shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <AnalyticsDashboard onOpenPalette={() => { onOpenPalette(); onClose(); }} onClose={onClose} />
      </div>
    </div>
  );
}
