import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isola falhas de render de um painel. Sem isto, um erro não tratado (ex.: o
 * webview lançando getWebContentsId antes do dom-ready, ou o xterm lendo
 * `dimensions` de undefined) sobe até a raiz do React e apaga a JANELA inteira
 * — a "tela preta". Aqui o estrago fica contido neste painel, com um botão de
 * recuperar que remonta a subárvore.
 */
export class PaneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Mantém o rastro no console para diagnóstico, sem derrubar o app.
    console.error('[Voltz IDE] Painel travou:', error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-bg-base p-6 text-center">
          <div className="rounded-2xl p-3" style={{ background: 'var(--danger-soft)' }}>
            <AlertTriangle size={22} className="text-danger" />
          </div>
          <p className="text-[13px] font-semibold text-text-secondary">Este painel travou</p>
          <p className="max-w-xs text-[11.5px] text-text-tertiary">
            Algo no painel parou de responder. Os outros painéis seguem normais.
          </p>
          <button
            onClick={this.reset}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <RotateCw size={13} /> Recarregar painel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
