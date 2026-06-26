import { Sparkles, RefreshCw, X, Download } from 'lucide-react';
import { useUpdateStore } from '@/stores/update';

/**
 * Card flutuante (canto inferior direito) que avisa sobre atualizações:
 * mostra o progresso do download e, quando pronto, um botão "Reiniciar para
 * atualizar". Fica visível por cima de tudo, sem mexer no layout.
 */
export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const install = useUpdateStore((s) => s.install);
  const dismiss = useUpdateStore((s) => s.dismiss);

  const show = !dismissed && (status.state === 'ready' || status.state === 'downloading');
  if (!show) return null;

  const ready = status.state === 'ready';
  const percent = Math.max(0, Math.min(100, status.percent ?? 0));
  const version = status.version ? `v${status.version}` : 'nova versão';

  return (
    <div
      className="fixed bottom-4 right-4 z-[300] w-[312px] overflow-hidden rounded-xl border shadow-2xl"
      style={{ background: 'var(--bg-overlay)', borderColor: ready ? 'var(--accent-strong)' : 'var(--border-default)' }}
    >
      <div className="flex items-start gap-2.5 p-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {ready ? <Sparkles size={15} /> : <Download size={15} className="animate-pulse" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-text-primary">
            {ready ? 'Atualização pronta' : 'Baixando atualização'}
          </div>
          <div className="text-[11px] text-text-tertiary">
            {ready
              ? <>Voltz IDE <span className="font-medium text-text-secondary">{version}</span> está pronta para instalar.</>
              : <>Voltz IDE <span className="font-medium text-text-secondary">{version}</span> · {percent}%</>}
          </div>
        </div>
        <button
          onClick={dismiss}
          className="-mr-1 -mt-1 shrink-0 rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
          title="Depois"
        >
          <X size={13} />
        </button>
      </div>

      {!ready && (
        <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-active)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${percent}%`, background: 'var(--accent)' }}
          />
        </div>
      )}

      {ready && (
        <div className="flex gap-2 border-t border-border-subtle px-3 py-2">
          <button
            onClick={install}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11.5px] font-semibold transition-colors"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <RefreshCw size={12} />
            Reiniciar para atualizar
          </button>
          <button
            onClick={dismiss}
            className="rounded-md px-3 py-1.5 text-[11.5px] font-medium text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            Depois
          </button>
        </div>
      )}
    </div>
  );
}
