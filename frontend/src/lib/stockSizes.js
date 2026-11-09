// Tamanhos do estoque de produto acabado — mesmos campos da Contagem.
export const STOCK_SIZES = [
  { size: 'half_liter', label: '500ml', kind: 'L', scale: 0.62 },
  { size: 'one_liter', label: '1L', kind: 'L', scale: 0.74 },
  { size: 'two_liter', label: '2L', kind: 'L', scale: 0.86 },
  { size: 'five_liter', label: '5L', kind: 'L', scale: 1 },
  { size: 'three_thirty_gram', label: '330g', kind: 'Kg', scale: 0.68 },
  { size: 'five_hundred_gram', label: '500g', kind: 'Kg', scale: 0.8 },
  { size: 'one_kg', label: '1Kg', kind: 'Kg', scale: 1 },
];

export const sizeInfo = (size) => STOCK_SIZES.find((s) => s.size === size) || { size, label: size, kind: 'L', scale: 1 };

export const productKind = (unit) => {
  const u = (unit || 'L').toLowerCase();
  return u.includes('kg') || u.includes('g') || u.includes('quilo') ? 'Kg' : 'L';
};

export const sizesForKind = (kind) => STOCK_SIZES.filter((s) => s.kind === kind);

export const errorMessage = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return fallback;
};
