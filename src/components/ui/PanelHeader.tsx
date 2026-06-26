import React from 'react';

/** Cabeçalho padrão dos painéis da sidebar (ícone + título + subtítulo + ações). */
export function PanelHeader({
  icon, title, subtitle, actions,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-subtle px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-bold tracking-tight text-text-primary">
          {icon && <span className="shrink-0 text-accent">{icon}</span>}
          <span className="truncate">{title}</span>
        </h2>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {subtitle && <p className="mt-0.5 text-[11px] text-text-muted">{subtitle}</p>}
    </div>
  );
}

/** Rótulo de seção dentro de um painel. */
export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-1 text-[10px] font-bold uppercase tracking-wider text-text-muted ${className}`}>
      {children}
    </div>
  );
}
