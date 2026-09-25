/**
 * Lava.top's dashboard gives you a "copy link" like
 * https://app.lava.top/products/<productId>/<offerId> to copy, not the bare
 * offerId on its own — accept either so it can be pasted directly into the
 * admin "Платежи" page's offer-link field without manually trimming it down
 * to the last path segment.
 */
export function extractOfferId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const segments = new URL(value).pathname.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : value;
  } catch {
    return value;
  }
}
