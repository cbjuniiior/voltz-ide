import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useToastsStore, type ToastKind } from '@/stores/toasts';

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  error: <AlertCircle size={16} />,
  info: <Info size={16} />,
};

const KIND_COLOR: Record<ToastKind, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--danger)',
  info: 'var(--accent)',
};

export function ToastContainer() {
  const items = useToastsStore((s) => s.items);
  const dismiss = useToastsStore((s) => s.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-[400] flex max-w-[400px] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => {
        const accent = KIND_COLOR[t.kind];
        return (
          <div
            key={t.id}
            className="toast-enter pointer-events-auto group relative flex items-start gap-3 overflow-hidden rounded-xl border bg-bg-overlay px-4 py-3 shadow-lg backdrop-blur"
            style={{
              borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
              minWidth: 320,
            }}
          >
            <div
              className="absolute left-0 top-0 h-full w-[3px]"
              style={{ background: accent }}
            />
            <div className="flex shrink-0 items-center justify-center pt-0.5" style={{ color: accent }}>
              {KIND_ICON[t.kind]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold tracking-tight text-text-primary">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 text-[11px] leading-snug text-text-tertiary">{t.description}</div>
              )}
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  className="mt-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-opacity hover:opacity-90"
                  style={{ background: accent, color: 'var(--accent-fg)' }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-md p-0.5 text-text-muted opacity-0 transition-all group-hover:opacity-100 hover:bg-bg-hover hover:text-text-primary"
              aria-label="Dispensar"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
