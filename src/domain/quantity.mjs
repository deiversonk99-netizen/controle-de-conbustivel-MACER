export function toMilli(value) {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(text)) throw new Error('Informe um número positivo com até três casas decimais.');
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}
export function formatMilli(value) {
  return (value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}
