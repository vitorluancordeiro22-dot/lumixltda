export const ORDER_UNITS = ['Kg', 'Litros', 'Fardos', 'Unidades'];

// Keep the typed string until validation: "1," must not turn into 1 mid-edit.
// Quantities have a decimal separator, without thousands separators.
export const parseOrderQuantity = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null;
  const number = Number(text.replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
};

export const searchOrderText = (text) => String(text || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export const emptyOrderDraft = () => ({
  step: 'suppliers', supplier: null, cart: [], quantities: {},
  unit: 'Kg', observations: '', newName: '',
});

export const hasOrderDraft = (draft) => Boolean(draft.supplier || draft.cart.length
  || draft.observations || draft.newName || Object.values(draft.quantities).some(Boolean));

export const readOrderDraft = (storage, key) => {
  const empty = emptyOrderDraft();
  const raw = storage.getItem(key);
  if (!raw) return empty;
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.cart)
      || !data.cart.every((item) => typeof item.key === 'string' && typeof item.name === 'string'
        && ['string', 'number'].includes(typeof item.quantity))
      || (data.supplier && (typeof data.supplier.id !== 'string' || typeof data.supplier.name !== 'string'))) {
    throw new Error('Invalid order draft');
  }
  return {
    ...empty,
    supplier: data.supplier || null,
    cart: data.cart,
    quantities: data.quantities && typeof data.quantities === 'object' && !Array.isArray(data.quantities)
      ? Object.fromEntries(Object.entries(data.quantities).filter(([, v]) => typeof v === 'string')) : {},
    unit: ORDER_UNITS.includes(data.unit) ? data.unit : 'Kg',
    observations: typeof data.observations === 'string' ? data.observations : '',
    newName: typeof data.newName === 'string' ? data.newName : '',
    step: data.supplier && ['items', 'summary'].includes(data.step) ? data.step : 'suppliers',
  };
};

export const orderItemsPayload = (draft) => {
  if (!draft.supplier || !draft.cart.length) throw new Error('Escolha um fornecedor e adicione itens.');
  return draft.cart.map((item) => {
    const quantity = parseOrderQuantity(item.quantity);
    if (quantity === null) throw new Error(`Confira a quantidade de ${item.name}. Use um número maior que zero, como 1,5.`);
    return { name: item.name, quantity, unit: draft.unit, raw_material_id: item.raw_material_id || null };
  });
};
