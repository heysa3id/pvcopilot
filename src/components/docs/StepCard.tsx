import type { LucideIcon } from 'lucide-react';
import { ImageHolder } from './ImageHolder';

export interface StepCardProps {
  eyebrowLabel: string;
  eyebrowIcon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
  imagePlaceholderLabel: string;
}

export function StepCard({
  eyebrowLabel,
  eyebrowIcon: Icon,
  title,
  description,
  bullets,
  imagePlaceholderLabel,
}: StepCardProps) {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 md:p-7">
      <div className="mb-4 inline-flex items-center gap-2 rounded-2xl bg-[#FFF3D6] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F5A400] dark:bg-[#F5A400]/10 dark:text-[#F5B433]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        <span>{eyebrowLabel}</span>
      </div>
      <h3 className="mb-3 max-w-4xl text-2xl font-extrabold leading-tight tracking-tight text-slate-950 dark:text-white md:text-[2.5rem]">
        {title}
      </h3>
      <p className="mb-4 max-w-4xl text-sm text-neutral-700 dark:text-neutral-200 md:text-base">
        {description}
      </p>
      <ul className="space-y-2 text-xs text-neutral-600 dark:text-neutral-300 md:text-sm">
        {bullets.map((bullet, i) => (
          <li key={i} className="list-disc pl-4">
            {bullet}
          </li>
        ))}
      </ul>
      <ImageHolder label={imagePlaceholderLabel} />
    </div>
  );
}
