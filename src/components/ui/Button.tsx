import React from 'react';

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger';
type Size = 'sm' | 'md';

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[11.5px] gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[12.5px] gap-2 rounded-lg',
};

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Botão padrão do app — variantes consistentes em todas as telas. */
export function Button({ variant = 'subtle', size = 'md', className = '', style, children, ...rest }: Props) {
  const base = 'inline-flex items-center justify-center font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none';
  const variantStyle: React.CSSProperties =
    variant === 'primary' ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
    : variant === 'danger' ? { background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)' }
    : variant === 'ghost' ? { background: 'transparent', color: 'var(--text-tertiary)' }
    : { background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' };

  const hoverClass =
    variant === 'primary' ? 'hover:brightness-110'
    : variant === 'ghost' ? 'hover:bg-bg-hover hover:text-text-primary'
    : variant === 'danger' ? 'hover:brightness-110'
    : 'hover:bg-bg-hover hover:text-text-primary hover:border-border-default';

  return (
    <button
      className={`${base} ${SIZES[size]} ${hoverClass} ${className}`}
      style={{ ...variantStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Botão só-ícone (quadrado). */
export function IconButton({
  size = 'md', active, activeColor = 'var(--accent)', className = '', style, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: Size; active?: boolean; activeColor?: string }) {
  const dim = size === 'sm' ? 'h-7 w-7 rounded-md' : 'h-8 w-8 rounded-lg';
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center transition-all focus-visible:outline-none ${dim} ${className}`}
      style={{
        background: active ? `color-mix(in srgb, ${activeColor} 16%, transparent)` : 'transparent',
        color: active ? activeColor : 'var(--text-tertiary)',
        border: active ? `1px solid color-mix(in srgb, ${activeColor} 35%, transparent)` : '1px solid transparent',
        ...style,
      }}
      onMouseEnter={(e) => { if (!active && !rest.disabled) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; } }}
      {...rest}
    >
      {children}
    </button>
  );
}
