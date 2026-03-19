import { useRef, useLayoutEffect } from 'react';
import { useScroll, useTransform, m } from 'framer-motion';
import { StepCard } from './StepCard';
import type { TimelineStep } from '../types/docs';

export interface TimelineProps {
  steps: TimelineStep[];
}

// Center of the 40px dot (left-3 = 12px + half of 40px = 20px)
const LINE_LEFT_OFFSET = 27;
const ACCENT = '#F4BB40';
const ACCENT_DARK = '#D4981F';

export function Timeline({ steps }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentHeightRef = useRef(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 10%', 'end 50%'],
  });

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      contentHeightRef.current = el.getBoundingClientRect().height;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [steps.length]);

  const animatedHeight = useTransform(scrollYProgress, (v) => {
    const h = contentHeightRef.current || 0;
    return `${v * h}px`;
  });
  const animatedOpacity = useTransform(scrollYProgress, [0, 0.15], [0, 1]);

  return (
    <div ref={containerRef} className="relative mx-auto max-w-[92rem] pb-20">
      {/* Base timeline line */}
      <div
        className="absolute bottom-0 left-0 top-0 w-0.5 overflow-hidden"
        style={{ left: LINE_LEFT_OFFSET }}
        aria-hidden
      >
        <div
          className="h-full w-full dark:opacity-80"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, rgb(203 213 225 / 0.6) 8%, rgb(203 213 225 / 0.6) 92%, transparent 100%)',
          }}
        />
      </div>

      {/* Animated progress line */}
      <m.div
        className="absolute left-0 top-0 w-[3px] rounded-full"
        style={{
          left: LINE_LEFT_OFFSET,
          height: animatedHeight,
          opacity: animatedOpacity,
          background: `linear-gradient(to bottom, ${ACCENT_DARK}, ${ACCENT}, transparent)`,
          boxShadow: `0 0 10px ${ACCENT}99, 0 0 20px ${ACCENT}4D, 0 0 40px ${ACCENT}26`,
        }}
        aria-hidden
      >
        {/* Glowing dot at the leading edge */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translate(-50%, 50%)',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: ACCENT,
            boxShadow: `0 0 8px 3px ${ACCENT}B3, 0 0 20px 6px ${ACCENT}80, 0 0 36px 10px ${ACCENT}4D`,
            animation: 'timeline-pulse 2s ease-in-out infinite',
          }}
        />
      </m.div>

      {/* Keyframes for pulse animation */}
      <style>{`
        @keyframes timeline-pulse {
          0%, 100% { box-shadow: 0 0 8px 3px ${ACCENT}B3, 0 0 20px 6px ${ACCENT}80, 0 0 36px 10px ${ACCENT}4D; transform: translate(-50%, 50%) scale(1); }
          50% { box-shadow: 0 0 14px 6px ${ACCENT}CC, 0 0 28px 10px ${ACCENT}99, 0 0 48px 16px ${ACCENT}66; transform: translate(-50%, 50%) scale(1.3); }
        }
      `}</style>

      <div ref={contentRef} className="relative">
        {steps.map((step) => (
          <div
            key={step.stepLabel}
            className="flex justify-start pt-10 md:gap-8 md:pt-28"
            style={{ position: 'relative' }}
          >
            {/* Node */}
            <div
              className="absolute left-3 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
              style={{ zIndex: 10 }}
              aria-hidden
            >
              <div
                className="h-3 w-3 rounded-full"
                style={{
                  background: `linear-gradient(to bottom, ${ACCENT}, ${ACCENT_DARK})`,
                }}
              />
            </div>

            {/* Left sticky label area (desktop) */}
            <div className="sticky top-32 z-20 flex max-w-[10rem] self-start md:w-full md:max-w-[12rem] md:flex-row lg:max-w-[13rem]">
              <span className="hidden pl-16 text-[0.6rem] font-bold text-neutral-500 md:block md:text-[1.1rem] lg:text-3xl">
                {step.stepLabel}
              </span>
            </div>

            {/* Right content */}
            <div className="relative w-full max-w-6xl pl-16 pr-4 md:pl-2">
              <span className="mb-4 block text-[0.9rem] font-bold text-neutral-500 md:hidden">
                {step.stepLabel}
              </span>
              <StepCard
                eyebrowLabel={step.eyebrowLabel}
                eyebrowIcon={step.icon}
                title={step.title}
                description={step.description}
                bullets={step.bullets}
                imagePlaceholderLabel={step.imagePlaceholderLabel}
                imageSrc={step.imageSrc}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
