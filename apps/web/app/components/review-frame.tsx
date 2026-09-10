'use client';
import { useEffect, useRef, useState } from 'react';

/** A still from the original blob; annotations remain separate from the evidence. */
export function ReviewFrame({
  url,
  timestampMs,
  region,
  onRegion,
  disabled = false,
}: {
  url: string;
  timestampMs: number;
  region?: { x: number; y: number; radius: number };
  onRegion?: (region: { x: number; y: number; radius: number } | undefined) => void;
  disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const media = document.createElement('video');
    let cancelled = false;
    media.muted = true;
    media.preload = 'auto';
    const draw = () => {
      if (cancelled || !canvas.current || !media.videoWidth) return;
      const target = canvas.current;
      target.width = 480;
      target.height = Math.round((480 * media.videoHeight) / media.videoWidth);
      target.getContext('2d')?.drawImage(media, 0, 0, target.width, target.height);
      setReady(true);
    };
    media.onloadeddata = () => {
      const time = Math.min(timestampMs / 1000, Math.max(0, media.duration - 0.001));
      if (time === 0) draw();
      else media.currentTime = time;
    };
    media.onseeked = draw;
    media.src = url;
    return () => {
      cancelled = true;
      media.removeAttribute('src');
      media.load();
    };
  }, [url, timestampMs]);
  return (
    <div>
      <div style={{ position: 'relative', maxWidth: onRegion ? 400 : 160 }}>
        <canvas
          ref={canvas}
          aria-label="Original video frame"
          style={{ width: '100%', display: 'block', background: '#101819' }}
        />
        {ready && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              cursor: onRegion ? 'crosshair' : 'default',
            }}
            onClick={(event) => {
              if (!onRegion || disabled) return;
              const box = event.currentTarget.getBoundingClientRect();
              onRegion({
                x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
                y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
                radius: region?.radius ?? 0.1,
              });
            }}
          >
            {region && (
              <ellipse
                cx={region.x * 100}
                cy={region.y * 100}
                rx={region.radius * 100}
                ry={region.radius * 100}
                fill="none"
                stroke="#ffad42"
                strokeWidth="1"
              />
            )}
          </svg>
        )}
      </div>
      {!ready && <small>Loading frame…</small>}
      {onRegion && (
        <fieldset disabled={disabled || !ready} style={{ border: 0, padding: 0 }}>
          <small>
            Select a point on the frame to highlight it, or use the controls below. Original video
            stays unchanged.
          </small>
          <button onClick={() => onRegion({ x: 0.5, y: 0.5, radius: 0.1 })}>
            Add / reset circle
          </button>
          {region && (
            <>
              {(['x', 'y', 'radius'] as const).map((key) => (
                <label key={key}>
                  {{ x: 'Horizontal position', y: 'Vertical position', radius: 'Circle size' }[key]}
                  <input
                    type="range"
                    min={key === 'radius' ? 0.01 : 0}
                    max={key === 'radius' ? 0.5 : 1}
                    step={0.01}
                    value={region[key]}
                    onChange={(event) => onRegion({ ...region, [key]: Number(event.target.value) })}
                  />
                </label>
              ))}
              <button onClick={() => onRegion(undefined)}>Remove circle</button>
            </>
          )}
        </fieldset>
      )}
    </div>
  );
}
