import type { LucideIcon } from 'lucide-react';

export interface TimelineStep {
  stepLabel: string;
  eyebrowLabel: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
  imagePlaceholderLabel: string;
  /** Optional path(s) to step image(s). Single string = one image; string[] = multiple images in one row (e.g. for Step 1). */
  imageSrc?: string | string[];
}
