import React from 'react';

/** Input de texto padrão. */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 text-[12px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent ${className}`}
        {...rest}
      />
    );
  },
);

/** Caixa de busca com ícone. */
export function SearchBox({
  value, onChange, placeholder = 'Buscar…', icon, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base px-2.5 py-1.5 transition-colors focus-within:border-accent ${className}`}>
      {icon && <span className="shrink-0 text-text-muted">{icon}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
        spellCheck={false}
      />
    </div>
  );
}
