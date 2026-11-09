import React from 'react';
import { sizeInfo } from '../lib/stockSizes';

// Garrafinha (L) ou pote (Kg) desenhada em SVG; altura proporcional ao tamanho.
export const StockBottle = ({ size, low = false, empty = false, className = '' }) => {
  const info = sizeInfo(size);
  const h = Math.round(46 * info.scale);
  const fill = empty ? 'fill-muted' : low ? 'fill-red-400' : 'fill-primary';
  const fillOpacity = empty ? 1 : 0.75;
  const stroke = low ? 'stroke-red-600' : 'stroke-primary';
  if (info.kind === 'Kg') {
    return (
      <svg viewBox="0 0 40 48" height={h} width={h * 0.83} className={className} aria-hidden="true">
        <rect x="6" y="6" width="28" height="7" rx="2" className={`${stroke} fill-background`} strokeWidth="2" />
        <rect x="4" y="13" width="32" height="32" rx="5" className={`${stroke} ${fill}`} fillOpacity={fillOpacity} strokeWidth="2" />
        <rect x="9" y="22" width="22" height="12" rx="2" className="fill-background" fillOpacity="0.85" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 30 60" height={h} width={h / 2} className={className} aria-hidden="true">
      <rect x="11" y="2" width="8" height="6" rx="1.5" className={`${stroke} fill-background`} strokeWidth="2" />
      <path d="M11 8 L11 14 Q4 18 4 26 L4 54 Q4 58 8 58 L22 58 Q26 58 26 54 L26 26 Q26 18 19 14 L19 8 Z"
            className={`${stroke} ${fill}`} fillOpacity={fillOpacity} strokeWidth="2" />
      <rect x="7" y="32" width="16" height="12" rx="2" className="fill-background" fillOpacity="0.85" />
    </svg>
  );
};
