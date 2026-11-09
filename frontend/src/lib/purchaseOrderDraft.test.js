import { emptyOrderDraft, hasOrderDraft, orderItemsPayload, parseOrderQuantity, readOrderDraft, searchOrderText } from './purchaseOrderDraft';

const draft = () => ({ ...emptyOrderDraft(), supplier: { id: 'supplier-1', name: 'Fornecedor' }, cart: [
  { key: 'rm-1', name: 'Base perolizante', quantity: '1,5', raw_material_id: 'raw-1' },
  { key: 'c-embalagem', name: 'Embalagem', quantity: '25', raw_material_id: null },
] });

test('accepts decimal comma/dot and integers without truncation', () => {
  expect(parseOrderQuantity('1,5')).toBe(1.5);
  expect(parseOrderQuantity(' 12.75 ')).toBe(12.75);
  expect(parseOrderQuantity('4000')).toBe(4000);
  expect(parseOrderQuantity('0,001')).toBe(0.001);
});

test.each(['', ' ', '0', '0,0', '-1', '1,', '.', '1e3', 'Infinity', 'NaN', '1,5kg', '1.000,50', '1,000.50', '1.2.3', '9'.repeat(400)])('rejects invalid quantity %s instead of silently parsing it', (value) => {
  expect(parseOrderQuantity(value)).toBeNull();
});

test('payload converts valid quantities once and preserves all items and raw-material links', () => {
  expect(orderItemsPayload(draft())).toEqual([
    { name: 'Base perolizante', quantity: 1.5, unit: 'Kg', raw_material_id: 'raw-1' },
    { name: 'Embalagem', quantity: 25, unit: 'Kg', raw_material_id: null },
  ]);
});

test('one invalid item blocks the complete order rather than omitting it', () => {
  const data = draft();
  data.cart[1].quantity = '0';
  expect(() => orderItemsPayload(data)).toThrow('Embalagem');
});

test('requires supplier and at least one item', () => {
  expect(() => orderItemsPayload(emptyOrderDraft())).toThrow();
  expect(() => orderItemsPayload({ ...draft(), cart: [] })).toThrow();
});

test('restores typed quantities, observations and review step from a versioned draft', () => {
  const saved = { ...draft(), version: 1, step: 'summary', quantities: { item: '0,' }, observations: 'Entregar sexta', unit: 'Litros' };
  const restored = readOrderDraft({ getItem: () => JSON.stringify(saved) }, 'account-1');
  expect(restored).toEqual(expect.objectContaining(savedWithoutVersion(saved)));
  expect(restored.quantities.item).toBe('0,');
});
const savedWithoutVersion = ({ version, ...data }) => data;

test('empty storage starts clean and malformed drafts are rejected', () => {
  expect(readOrderDraft({ getItem: () => null }, 'key')).toEqual(emptyOrderDraft());
  expect(() => readOrderDraft({ getItem: () => '{broken' }, 'key')).toThrow();
  expect(() => readOrderDraft({ getItem: () => JSON.stringify({ version: 1, cart: [{}] }) }, 'key')).toThrow();
});

test('keeps pending item text in the draft and distinguishes a completely empty one', () => {
  expect(hasOrderDraft(emptyOrderDraft())).toBe(false);
  expect(hasOrderDraft({ ...emptyOrderDraft(), quantities: { item: '1,' } })).toBe(true);
  expect(hasOrderDraft({ ...emptyOrderDraft(), newName: 'Essência' })).toBe(true);
});

test('search ignores accents and case', () => {
  expect(searchOrderText('  ESSÊNCIA CÍTRICA ')).toBe('essencia citrica');
});
