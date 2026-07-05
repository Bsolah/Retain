export function ProductThumb({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl?: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (imageUrl) {
    return (
      <img className="product-thumb" src={imageUrl} alt="" loading="lazy" />
    );
  }

  return (
    <div className="product-thumb placeholder" aria-hidden>
      {initials || '•'}
    </div>
  );
}
