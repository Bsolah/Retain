export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="stack">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton card" />
      ))}
    </div>
  );
}
