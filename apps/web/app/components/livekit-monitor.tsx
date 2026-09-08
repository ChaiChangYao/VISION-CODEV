'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';

type MonitorStatus = 'waiting' | 'connecting' | 'connected' | 'degraded' | 'disconnected' | 'error';

export function LiveKitMonitor({ serverUrl, viewerToken }: { serverUrl: string; viewerToken: string }) {
  const videoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<MonitorStatus>(serverUrl && viewerToken ? 'connecting' : 'waiting');
  const [detail, setDetail] = useState(serverUrl && viewerToken ? 'Connecting to the LiveKit room.' : 'Waiting for a scoped viewer token.');

  useEffect(() => {
    if (!serverUrl || !viewerToken) {
      setStatus('waiting');
      setDetail('Waiting for a scoped viewer token.');
      return;
    }
    const room = new Room({ adaptiveStream: true, dynacast: true });
    const attached: RemoteTrack[] = [];
    let disposed = false;
    const attach = (track: RemoteTrack) => {
      const element = track.attach();
      const target = track.kind === Track.Kind.Video ? videoRef.current : audioRef.current;
      if (!target || disposed) {
        track.detach(element);
        return;
      }
      target.replaceChildren(element);
      attached.push(track);
    };
    const detach = (track: RemoteTrack) => {
      track.detach();
      const target = track.kind === Track.Kind.Video ? videoRef.current : audioRef.current;
      target?.replaceChildren();
    };
    room.on(RoomEvent.TrackSubscribed, (track) => attach(track));
    room.on(RoomEvent.TrackUnsubscribed, (track) => detach(track));
    room.on(RoomEvent.Reconnecting, () => { setStatus('degraded'); setDetail('LiveKit is reconnecting the desktop monitor.'); });
    room.on(RoomEvent.Reconnected, () => { setStatus('connected'); setDetail('Desktop monitor reconnected.'); });
    room.on(RoomEvent.Disconnected, () => { setStatus('disconnected'); setDetail('The LiveKit monitor disconnected.'); });
    void room.connect(serverUrl, viewerToken)
      .then(() => { if (!disposed) { setStatus('connected'); setDetail('Connected; waiting for phone camera and microphone tracks.'); } })
      .catch((error: unknown) => { if (!disposed) { setStatus('error'); setDetail(error instanceof Error ? error.message : 'The LiveKit monitor could not connect.'); } });
    return () => {
      disposed = true;
      room.removeAllListeners();
      for (const track of attached) track.detach();
      videoRef.current?.replaceChildren();
      audioRef.current?.replaceChildren();
      void room.disconnect().catch(() => undefined);
    };
  }, [serverUrl, viewerToken]);

  return (
    <div className="monitor-stage" aria-label="LiveKit desktop monitor preview">
      <div className="monitor-grid" />
      <div ref={videoRef} className="monitor-video" aria-label="Phone camera stream" />
      <div ref={audioRef} className="monitor-audio" aria-label="Phone microphone stream" />
      {status !== 'connected' ? <div className="monitor-placeholder"><strong>{status === 'error' ? 'Monitor unavailable' : status === 'waiting' ? 'Waiting for phone video' : 'Connecting to phone'}</strong><small>{detail}</small></div> : null}
    </div>
  );
}
