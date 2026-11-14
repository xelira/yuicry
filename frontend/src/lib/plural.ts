export function pluralRu(count: number, one: string, few: string, many: string) {
  const value = Math.abs(count) % 100;
  const last = value % 10;

  if (value > 10 && value < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
