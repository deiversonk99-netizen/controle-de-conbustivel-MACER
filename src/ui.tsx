import type { ReactNode } from 'react';
import { civilDay } from './domain/business.mjs';
export type Row = Record<string, any>;
export const names: Record<string, string> = {
  fuel: 'Abastecimento',
  receipt: 'Recebimento',
  opening: 'Saldo inicial',
  transfer: 'Transferência',
  reversal: 'Estorno',
};
export const money = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100);
export const errorMessage = (e: any) =>
  e.code === 'unavailable'
    ? 'A conexão está sendo restabelecida. A fila permanece salva para reenvio.'
    : e.code === 'permission-denied'
      ? 'Seu acesso não permite esta ação. Procure o responsável pela unidade. Os registros já salvos no aparelho foram mantidos.'
      : e.name === 'QuotaExceededError'
        ? 'Não foi possível salvar: o armazenamento do aparelho está cheio. Não apague registros pendentes. Em Pendências, libere apenas as cópias já confirmadas e tente novamente.'
        : e.message || 'Não foi possível concluir.';
export const pack = (value: any): any =>
  value?.toMillis
    ? { milliseconds: value.toMillis() }
    : Array.isArray(value)
      ? value.map(pack)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pack(v)]))
        : value;
export const day = (o: Row) =>
  o.businessDate ||
  civilDay(o.createdAt?.milliseconds || o.createdAt?.toMillis?.() || o.capturedAtMs);
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
