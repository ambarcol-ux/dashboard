export async function collectPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await fetchPage(offset, offset + 499);
    if (error) throw error;
    if (!data) throw new Error('No se pudieron cargar los datos.');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
