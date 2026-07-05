import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card empty stack">
      <svg
        className="empty-illustration"
        viewBox="0 0 160 120"
        role="img"
        aria-hidden
      >
        <rect
          x="20"
          y="30"
          width="120"
          height="70"
          rx="14"
          fill="#eef2ff"
          stroke="#c7d2fe"
        />
        <circle cx="56" cy="58" r="12" fill="#a5b4fc" />
        <rect x="78" y="48" width="44" height="8" rx="4" fill="#c7d2fe" />
        <rect x="78" y="62" width="32" height="8" rx="4" fill="#ddd6fe" />
        <path
          d="M40 100c20-18 60-18 80 0"
          fill="none"
          stroke="#818cf8"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {action}
    </div>
  );
}
