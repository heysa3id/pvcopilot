import { useState } from 'react';
import type { ReactNode } from 'react';

export interface ImageHolderProps {
  label: string;
  /** When set, render image(s). Single path = one image; array = multiple images in one row. */
  imageSrc?: string | string[];
  children?: ReactNode;
}

function PlaceholderBlock({ label }: { label: string }) {
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

function SingleImage({
  src,
  alt,
  onError,
}: {
  src: string;
  alt: string;
  onError: () => void;
}) {
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900">
      <img
        src={src}
        alt={alt}
        className="h-auto w-full object-contain"
        onError={onError}
      />
    </div>
  );
}

export function ImageHolder({ label, imageSrc }: ImageHolderProps) {
  const [imageError, setImageError] = useState(false);
  const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());

  const sources = Array.isArray(imageSrc) ? imageSrc : imageSrc ? [imageSrc] : [];

  if (sources.length > 1) {
    return (
      <div className="mt-4 flex flex-wrap gap-4">
        {sources.map((src, i) => (
          <div key={i} className="min-w-[200px] flex-1 basis-0">
            {failedIndices.has(i) ? (
              <PlaceholderBlock label={`${label} (${i + 1})`} />
            ) : (
              <SingleImage
                src={src}
                alt={`${label} ${i + 1}`}
                onError={() =>
                  setFailedIndices((prev) => new Set(prev).add(i))
                }
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  if (sources.length === 1 && !imageError) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900">
        <img
          src={sources[0]}
          alt={label}
          className="h-auto w-full object-contain"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return <PlaceholderBlock label={label} />;
}
