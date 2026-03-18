import { useRef, useLayoutEffect } from 'react';
import { useScroll, useTransform, m } from 'framer-motion';
import { StepCard } from './StepCard';
import type { TimelineStep } from '../types/docs';

export interface TimelineProps {
  steps: TimelineStep[];
}

const LINE_LEFT_OFFSET = 19;

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
        className="absolute left-0 top-0 w-0.5 rounded-full"
        style={{
          left: LINE_LEFT_OFFSET,
          height: animatedHeight,
          opacity: animatedOpacity,
          background: 'linear-gradient(to bottom, rgb(217 119 6), rgb(251 191 36), transparent)',
          backgroundSize: '100% 100%',
        }}
        aria-hidden
      />

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
                  background: 'linear-gradient(to bottom, rgb(251 191 36), rgb(217 119 6))',
                }}
              />
            </div>

            {/* Left sticky label area (desktop) */}
            <div className="sticky top-32 z-20 flex max-w-[10rem] self-start md:w-full md:max-w-[12rem] md:flex-row lg:max-w-[13rem]">
              <span className="hidden pl-20 text-[0.6rem] font-bold text-neutral-500 md:block md:text-[1.1rem] lg:text-3xl">
                {step.stepLabel}
              </span>
            </div>

            {/* Right content */}
            <div className="relative w-full max-w-6xl pl-20 pr-4 md:pl-2">
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
