'use client';
import { useEffect, useState } from 'react';
import { Button } from '@vision-codef/ui';
import { getApiClient } from '../../src/lib/api-client';

export function PresetVideoPicker({ disabled, onSelect }: { disabled: boolean; onSelect: (id: string) => Promise<void> }) {
  const [videos, setVideos] = useState<Array<{ id: string; title: string; available: boolean; sizeBytes?: number }>>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void getApiClient().listPresetVideos().then((items) => { if (active) setVideos(items); }).catch(() => { if (active) setError('Sample library is unavailable. You can still upload an MP4.'); }); return () => { active = false; }; }, []);
  return <section className="studio-inspector-section" aria-label="Sample video library">
    <h3>Or choose a sample video</h3>
    <p>First-person recordings from our library. These samples have no spoken narration.</p>
    {error ? <p role="status">{error}</p> : <>
      <label htmlFor="preset-video">Sample video</label>
      <select id="preset-video" value={selected} disabled={disabled || videos.length === 0} onChange={(event) => setSelected(event.target.value)} style={{ width: '100%', padding: '12px', margin: '8px 0 12px', font: 'inherit' }}>
        <option value="">{videos.length ? 'Choose a video…' : 'Loading samples…'}</option>
        {videos.map((video) => <option key={video.id} value={video.id} disabled={!video.available}>{video.title}{video.available ? ` · ${((video.sizeBytes ?? 0) / 1048576).toFixed(1)} MB` : ' · unavailable'}</option>)}
      </select>
      <Button variant="secondary" disabled={disabled || !selected} onClick={() => void onSelect(selected)}>Use sample & process</Button>
      <p><small>Creates a new capture. Review and publish the generated draft before using it for guidance.</small></p>
    </>}
  </section>;
}
