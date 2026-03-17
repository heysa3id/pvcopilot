'use client'

import { ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs) {
  // Simple clsx/twMerge combo, fine for JS
  return twMerge(clsx(inputs))
}

export default function MotionButton({ label, variant = 'primary', classes, animate = true, delay = 0 }) {
  return (
    <button
      className={cn(
        'motion-button group',
        variant === 'secondary' && 'motion-button-secondary',
        classes
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className='circle' aria-hidden='true' />
      <div className='icon'>
        <ArrowRight className='icon-arrow' />
      </div>
      <span className='button-text'>
        {label}
      </span>
    </button>
  )
}

