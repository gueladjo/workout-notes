import type { ReactNode } from 'react';

export function EmptyState({
  title,
  message,
  children,
}: {
  title: string;
  message?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {message && <div>{message}</div>}
      {children && <div className="empty__actions">{children}</div>}
    </div>
  );
}
