import type { LucideIcon } from 'lucide-react';

export interface TimelineStep {
  stepLabel: string;
  eyebrowLabel: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
  imagePlaceholderLabel: string;
}
