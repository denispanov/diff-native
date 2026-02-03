import { formatCurrency, roundMoney } from './utils';

export function calculateTotal(items: Array<{ price: number; qty: number }>): number {
  let total = 0;
  for (const item of items) {
    const lineTotal = roundMoney(item.price * item.qty);
    total += lineTotal;
  }
  return roundMoney(total);
}

export function renderReceipt(items: Array<{ name: string; price: number; qty: number }>): string {
  const total = calculateTotal(items);
  const lines = items.map(item => {
    return `${item.name} x${item.qty} - ${formatCurrency(roundMoney(item.price * item.qty))}`;
  });
  lines.push('');
  lines.push(`TOTAL: ${formatCurrency(total)}`);
  return lines.join('\n');
}

export function summarize(items: Array<{ price: number; qty: number }>): string {
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  return `Items: ${totalQty}`;
}
