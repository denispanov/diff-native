import { formatCurrency } from './utils';

export function calculateTotal(items: Array<{ price: number; qty: number }>): number {
  let total = 0;
  for (const item of items) {
    total += item.price * item.qty;
  }
  return total;
}

export function renderReceipt(items: Array<{ name: string; price: number; qty: number }>): string {
  const total = calculateTotal(items);
  const lines = items.map(item => {
    return `${item.name} x${item.qty} - ${formatCurrency(item.price * item.qty)}`;
  });
  lines.push(`TOTAL: ${formatCurrency(total)}`);
  return lines.join('\n');
}
