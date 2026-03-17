import type { ReactNode } from 'react';

export interface ImageHolderProps {
  label: string;
  children?: ReactNode;
}

export function ImageHolder({ label }: ImageHolderProps) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex h-48 w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-50 dark:from-neutral-900 dark:to-neutral-950">
        <div className="flex flex-col items-center justify-center gap-1 text-center text-sm text-neutral-500 dark:text-neutral-400">
          <span>Image placeholder</span>
          <span className="font-medium">{label}</span>
        </div>
      </div>
    </div>
  );
}
