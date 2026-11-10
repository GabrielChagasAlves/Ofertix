/** Keeps review queues balanced between Mercado Livre and Shopee. */
export function alternateMarketplaceItems<T>(items: T[], getSlug: (item: T) => string | null | undefined): T[] {
  const mercadoLivre: T[] = [];
  const shopee: T[] = [];
  const others: T[] = [];
  for (const item of items) {
    const slug = (getSlug(item) ?? '').toLowerCase().replace(/[-\s]/g, '_');
    if (slug === 'mercado_livre' || slug === 'mercadolivre') mercadoLivre.push(item);
    else if (slug === 'shopee') shopee.push(item);
    else others.push(item);
  }
  const balanced: T[] = [];
  const total = Math.max(mercadoLivre.length, shopee.length);
  for (let index = 0; index < total; index += 1) {
    if (index < mercadoLivre.length) balanced.push(mercadoLivre[index]);
    if (index < shopee.length) balanced.push(shopee[index]);
  }
  return [...balanced, ...others];
}