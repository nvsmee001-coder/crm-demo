type BrandLogoProps = {
  className?: string;
  variant?: 'wordmark' | 'mark';
  decorative?: boolean;
};

/** Display the supplied artwork unchanged; the viewBox removes its empty margin. */
export default function BrandLogo({ className = '', variant = 'wordmark', decorative = false }: BrandLogoProps) {
  const compact = variant === 'mark';
  return (
    <img
      className={`smee-brand-logo ${compact ? 'smee-brand-symbol' : 'smee-brand-wordmark'} ${className}`}
      src={compact ? '/brand/smee-favicon.svg' : '/brand/smee-logo.svg'}
      width={compact ? 808 : 1744}
      height={compact ? 784 : 766}
      alt={decorative ? '' : 'SMEE agency'}
      draggable={false}
    />
  );
}
