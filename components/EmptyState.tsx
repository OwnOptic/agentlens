import React from 'lucide-react';
import { Button } from '@/components/ui';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  message,
  actionHref,
  actionLabel,
}: {
  icon?: LucideIcon;
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      {Icon && <Icon className="h-12 w-12 text-slate-600" />}
      <div>
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{message}</p>
      </div>
      {actionHref && actionLabel && (
        <Button href={actionHref} variant="primary">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
