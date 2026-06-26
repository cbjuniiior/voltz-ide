interface Props {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Voltz brand mark — 4 rotated squares forming a stylized lightning bolt.
 * Renders inline so it can inherit currentColor for any tint.
 */
export function LogoMark({ size = 24, color = 'currentColor', className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 216 216"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="32.1112" y="151.422" width="58.2224" height="58.2224" transform="rotate(-30 32.1112 151.422)" fill={color} />
      <rect x="82.5334" y="122.311" width="58.2224" height="58.2224" transform="rotate(-30 82.5334 122.311)" fill={color} />
      <rect x="53.4222" y="71.8888"  width="58.2224" height="58.2224" transform="rotate(-30 53.4222 71.8888)"  fill={color} />
      <rect x="103.844" y="42.7776"  width="58.2224" height="58.2224" transform="rotate(-30 103.844 42.7776)"  fill={color} />
    </svg>
  );
}
