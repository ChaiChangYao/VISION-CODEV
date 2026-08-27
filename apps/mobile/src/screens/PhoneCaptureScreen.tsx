import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { OrientationSafeCaptureView } from '../components/OrientationSafeCaptureView';
import { PhoneCaptureSession } from '../media/phoneCaptureSession';
import type { CaptureSnapshot } from '../types';

const initialSnapshot: CaptureSnapshot = {
  state: 'draft',
  connection: 'disconnected',
  sessionId: '',
  facingMode: 'rear',
  orientation: 'portrait',
  audioRoute: 'unknown',
  egressHealthy: true,
  recoveryPending: 0,
};

export function PhoneCaptureScreen() {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [message, setMessage] = useState<string | undefined>();
  const session = useMemo(() => {
    const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
    const serverUrl = stringValue(extra?.livekitServerUrl) ?? process.env.EXPO_PUBLIC_LIVEKIT_URL;
    const tokenEndpoint =
      stringValue(extra?.captureTokenEndpoint) ?? process.env.EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT;
    if (!serverUrl || !tokenEndpoint) return undefined;

    return new PhoneCaptureSession({
      serverUrl,
      sessionId: process.env.EXPO_PUBLIC_SESSION_ID ?? '',
      getToken: () =>
        requestLiveKitToken(tokenEndpoint, {
          companyId: process.env.EXPO_PUBLIC_COMPANY_ID ?? '',
          memberId: process.env.EXPO_PUBLIC_MEMBER_ID ?? '',
          workflowId: process.env.EXPO_PUBLIC_WORKFLOW_ID ?? '',
          sessionId: process.env.EXPO_PUBLIC_SESSION_ID ?? '',
        }),
    });
  }, []);

  useEffect(() => {
    if (!session) {
      setMessage(
        'Configure EXPO_PUBLIC_LIVEKIT_URL and EXPO_PUBLIC_CAPTURE_TOKEN_ENDPOINT for a physical-device build.',
      );
      return;
    }
    return session.subscribe(setSnapshot);
  }, [session]);

  useEffect(() => () => session?.dispose(), [session]);

  const start = async () => {
    if (!session) return;
    setMessage(undefined);
    try {
      await session.start();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const stop = async () => {
    if (!session) return;
    await session.stop();
    setMessage('Capture finalized. LiveKit Egress remains the canonical recording.');
  };

  return (
    <OrientationSafeCaptureView>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>VISION CODEF</Text>
            <Text style={styles.title}>Golden Run capture</Text>
          </View>
          <View
            style={[styles.statusDot, snapshot.connection === 'connected' && styles.statusDotLive]}
          />
        </View>

        <View style={styles.preview}>
          <Text style={styles.previewLabel}>
            {snapshot.state === 'active' ? 'CAPTURING' : 'READY'}
          </Text>
          <Text style={styles.previewTitle}>Rear camera · {snapshot.connection}</Text>
          <Text style={styles.previewHint}>
            Keep this app foregrounded and the screen awake while the session is active.
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Meta label="Audio" value={snapshot.audioRoute} />
          <Meta label="Egress" value={snapshot.egressHealthy ? 'healthy' : 'recovery watch'} />
          <Meta label="Recovery" value={`${snapshot.recoveryPending} pending`} />
        </View>

        {message || snapshot.error ? (
          <Text style={styles.message}>{message ?? snapshot.error}</Text>
        ) : null}

        <View style={styles.controls}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void session?.switchCamera()}
            disabled={!session || snapshot.state !== 'active'}
          >
            <Text style={styles.secondaryButtonText}>Flip camera</Text>
          </Pressable>
          {snapshot.state === 'active' || snapshot.state === 'paused' ? (
            <Pressable style={styles.stopButton} onPress={() => void stop()}>
              <Text style={styles.stopButtonText}>Stop capture</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.startButton}
              onPress={() => void start()}
              disabled={!session || snapshot.state === 'preparing'}
            >
              <Text style={styles.startButtonText}>
                {snapshot.state === 'failed' ? 'Retry' : 'Start capture'}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </OrientationSafeCaptureView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function requestLiveKitToken(
  endpoint: string,
  input: { companyId: string; memberId: string; workflowId: string; sessionId: string },
): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': input.companyId, 'x-member-id': input.memberId },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Capture token request failed (${response.status}).`);
  const payload: unknown = await response.json();
  if (!isTokenResponse(payload)) throw new Error('Capture token response did not contain a token.');
  return payload.token;
}

function isTokenResponse(value: unknown): value is { token: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'token' in value &&
    typeof value.token === 'string' &&
    value.token.length > 0
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, padding: 20, justifyContent: 'space-between' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: '#73e6c3', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#f6f8fb', fontSize: 25, fontWeight: '700', marginTop: 5 },
  statusDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#536174' },
  statusDotLive: { backgroundColor: '#73e6c3' },
  preview: {
    flex: 1,
    minHeight: 260,
    marginVertical: 20,
    borderRadius: 24,
    padding: 24,
    justifyContent: 'flex-end',
    backgroundColor: '#102238',
    borderWidth: 1,
    borderColor: '#213b56',
  },
  previewLabel: { color: '#73e6c3', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  previewTitle: { color: '#f6f8fb', fontSize: 22, fontWeight: '700', marginTop: 8 },
  previewHint: { color: '#a7b5c8', fontSize: 14, lineHeight: 20, marginTop: 10, maxWidth: 420 },
  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  meta: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#101c2e' },
  metaLabel: { color: '#7e8da3', fontSize: 11, textTransform: 'uppercase' },
  metaValue: { color: '#e4ebf5', fontSize: 13, marginTop: 5 },
  message: { color: '#ffcf86', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  controls: { flexDirection: 'row', gap: 12 },
  secondaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3d526d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#d5e0ee', fontSize: 15, fontWeight: '600' },
  startButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#73e6c3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButtonText: { color: '#07151b', fontSize: 15, fontWeight: '800' },
  stopButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: '#ff8d83',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButtonText: { color: '#2b0d0b', fontSize: 15, fontWeight: '800' },
});
