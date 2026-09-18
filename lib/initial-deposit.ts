export function initialDepositAmount(value: string): number {
  const amount = value.trim() === '' ? 0 : Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999.99) {
    throw new Error('Depósito inválido');
  }
  return Math.round(amount * 100) / 100;
}
