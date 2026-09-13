import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { Camera } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { createSherpaGuidanceSpeaker } from '../audio/sherpaGuidanceSpeaker';
import type { LocalGuidanceSpeaker } from '../audio/localGuidanceSpeaker';
import { LiveKitPhoneClient } from '../media/livekitPhoneClient';
import { claimTutorial, requestTutorialAccess, type PairedTutorial, type TutorialApiConfig } from '../tutorial/tutorialApi';

const WAKE_TAG = 'vision-codef-tutorial';

type TutorialStatus = 'ready' | 'joining' | 'connected' | 'reconnecting' | 'failed';
type TutorialRuntimeConfig = TutorialApiConfig & { serverUrl: string; ttsModelPath: string };

export function TutorialScreen({ onBack }: { onBack: () => void }) {
  const [pairingCode, setPairingCode] = useState('');
  const [status, setStatus] = useState<TutorialStatus>('ready');
  const [message, setMessage] = useState('Enter the tutorial code shown on the laptop.');
  const [guidance, setGuidance] = useState('Waiting for approved guidance.');
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const clientRef = useRef<LiveKitPhoneClient | undefined>(undefined);
  const speakerRef = useRef<LocalGuidanceSpeaker | undefined>(undefined);
  const speakerUnsubscribeRef = useRef<(() => void) | undefined>(undefined);

  const config = useMemo(() => {
    const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
    const serverUrl = stringValue(extra?.livekitServerUrl) ?? process.env.EXPO_PUBLIC_LIVEKIT_URL;
    const apiBaseUrl = stringValue(extra?.apiBaseUrl) ?? process.env.EXPO_PUBLIC_API_BASE_URL;
    const pairingEndpoint =
      process.env.EXPO_PUBLIC_DEPLOYMENT_PAIRING_ENDPOINT ??
      (apiBaseUrl ? new URL('/v1/deployment-pairings/claim', apiBaseUrl).toString() : undefined);
    const tokenEndpoint =
      process.env.EXPO_PUBLIC_DEPLOYMENT_TOKEN_ENDPOINT ??
      (apiBaseUrl ? new URL('/v1/deployment-token', apiBaseUrl).toString() : undefined);
    const ttsModelPath = stringValue(extra?.ttsModelPath) ?? process.env.EXPO_PUBLIC_TTS_MODEL_PATH;
    if (!serverUrl || !pairingEndpoint || !tokenEndpoint || !ttsModelPath) return undefined;
    return {
      serverUrl,
      pairingEndpoint,
      tokenEndpoint,
      ttsModelPath,
      companyId: process.env.EXPO_PUBLIC_COMPANY_ID ?? '',
      memberId: process.env.EXPO_PUBLIC_MEMBER_ID ?? '',
      deviceId: process.env.EXPO_PUBLIC_DEVICE_ID ?? 'vision-codef-phone',
    };
  }, []);

  useEffect(() => () => {
    speakerUnsubscribeRef.current?.();
    void disconnect(clientRef.current, speakerRef.current);
  }, []);

  const join = async () => {
    if (!config || status === 'joining') {
      if (!config) setMessage('This APK is missing its tutorial connection or on-device voice model configuration.');
      return;
    }
    setStatus('joining');
    setMessage('Joining tutorial…');
    try {
      const paired = await claimTutorial(config, pairingCode.trim());
      const access = await requestTutorialAccess(config, paired);
      const camera = await Camera.requestCameraPermissionsAsync();
      const microphone = await Camera.requestMicrophonePermissionsAsync();
      if (!camera.granted || !microphone.granted) throw new Error('Camera and microphone permissions are required.');
      const speaker = createSherpaGuidanceSpeaker({ modelDirectory: config.ttsModelPath });
      speakerRef.current = speaker;
      speakerUnsubscribeRef.current?.();
      speakerUnsubscribeRef.current = speaker.subscribe(() => setSpeaking(speaker.isSpeaking()));
      const client = tutorialClient(config, paired, access.token, speaker, setStatus, setMessage, setGuidance, () => mutedRef.current);
      clientRef.current = client;
      await activateKeepAwakeAsync(WAKE_TAG);
      await client.connect();
      setGuidance(access.currentInstruction);
      setStatus('connected');
      setMessage('Tutorial connected. Point the rear camera at the task.');
      if (!muted) void speaker.speak(access.currentInstruction, { priority: 'normal' }).catch((error: unknown) =>
        setMessage(`Tutorial connected. Voice needs attention: ${error instanceof Error ? error.message : String(error)}`),
      );
    } catch (error) {
      setStatus('failed');
      setMessage(error instanceof Error ? error.message : String(error));
      await disconnect(clientRef.current, speakerRef.current);
      speakerUnsubscribeRef.current?.();
      speakerUnsubscribeRef.current = undefined;
      clientRef.current = undefined;
      speakerRef.current = undefined;
    }
  };

  const leave = async () => {
    await disconnect(clientRef.current, speakerRef.current);
    speakerUnsubscribeRef.current?.();
    speakerUnsubscribeRef.current = undefined;
    clientRef.current = undefined;
    speakerRef.current = undefined;
    setStatus('ready');
    setSpeaking(false);
    setMessage('Tutorial disconnected.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={status === 'connected' ? leave : onBack} accessibilityRole="button">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={[styles.dot, status === 'connected' && styles.dotLive]} />
      </View>
      <Text style={styles.eyebrow}>VISION CODEF</Text>
      <Text style={styles.title}>Run tutorial</Text>
      <Text style={styles.subtitle}>Follow approved guidance while your rear camera observes the task.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Tutorial code</Text>
        <TextInput
          value={pairingCode}
          onChangeText={(value) => setPairingCode(value.replace(/\D/g, '').slice(0, 6))}
          editable={status !== 'joining' && status !== 'connected'}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          placeholderTextColor="#718199"
          style={styles.code}
          accessibilityLabel="Tutorial code"
        />
        <Text style={styles.message}>{message}</Text>
        {status !== 'connected' ? (
          <Pressable
            style={[styles.primary, (!config || pairingCode.length !== 6 || status === 'joining') && styles.disabled]}
            disabled={!config || pairingCode.length !== 6 || status === 'joining'}
            onPress={() => void join()}
          >
            <Text style={styles.primaryText}>{status === 'joining' ? 'Joining…' : 'Join tutorial'}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.stop} onPress={() => void leave()}>
            <Text style={styles.stopText}>End tutorial</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.guidanceCard}>
        <Text style={styles.label}>{speaking ? 'SPEAKING' : 'CURRENT GUIDANCE'}</Text>
        <Text style={styles.guidance}>{guidance}</Text>
        <Text style={styles.privacy}>Voice is generated on this phone. No audio is sent to a cloud TTS provider.</Text>
        {status === 'connected' ? <View style={styles.guidanceControls}>
          <Pressable style={styles.secondary} onPress={() => { if (!muted) void speakerRef.current?.speak(guidance, { priority: 'normal' }); }} accessibilityRole="button">
            <Text style={styles.secondaryText}>Repeat</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => { const next = !mutedRef.current; mutedRef.current = next; setMuted(next); if (next) void speakerRef.current?.interrupt(); }} accessibilityRole="button">
            <Text style={styles.secondaryText}>{muted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>
        </View> : null}
      </View>
    </SafeAreaView>
  );
}

function tutorialClient(
  config: TutorialRuntimeConfig,
  paired: PairedTutorial,
  token: string,
  speaker: LocalGuidanceSpeaker,
  setStatus: (status: TutorialStatus) => void,
  setMessage: (message: string) => void,
  setGuidance: (message: string) => void,
  isMuted: () => boolean,
): LiveKitPhoneClient {
  return new LiveKitPhoneClient({
    serverUrl: config.serverUrl,
    sessionId: paired.deploymentId,
    receiveGuidanceAudio: false,
    getToken: async () => token,
    onConnected: () => setStatus('connected'),
    onReconnecting: () => { setStatus('reconnecting'); setMessage('Connection interrupted. Reconnecting…'); },
    onReconnected: () => { setStatus('connected'); setMessage('Tutorial reconnected.'); },
    onDisconnected: () => { setStatus('failed'); setMessage('Tutorial disconnected. Tap Join tutorial to reconnect.'); },
    onGuidanceMessage: (value) => {
      if (value.type === 'interrupt') { void speaker.interrupt(); return; }
      setGuidance(value.text);
      if (!isMuted()) void speaker.speak(value.text, { priority: value.priority }).catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : String(error)),
      );
    },
    onError: (error) => { setStatus('failed'); setMessage(error.message); },
  });
}

async function disconnect(client?: LiveKitPhoneClient, speaker?: LocalGuidanceSpeaker) {
  await client?.disconnect(true);
  await speaker?.dispose();
  deactivateKeepAwake(WAKE_TAG);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07111f', padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { color: '#9eb0c7', fontSize: 17, paddingVertical: 10 },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#5b6879' },
  dotLive: { backgroundColor: '#62dfbd' },
  eyebrow: { color: '#67dfbd', letterSpacing: 4, fontSize: 15, fontWeight: '700', marginTop: 18 },
  title: { color: '#f4f7fb', fontSize: 40, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#9eb0c7', fontSize: 17, lineHeight: 24, marginTop: 8 },
  card: { backgroundColor: '#112238', borderColor: '#29415d', borderWidth: 1, borderRadius: 24, padding: 22, marginTop: 28 },
  label: { color: '#67dfbd', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  code: { color: '#ffffff', borderColor: '#405775', borderWidth: 1, borderRadius: 15, fontSize: 34, letterSpacing: 10, padding: 16, marginTop: 13, textAlign: 'center' },
  message: { color: '#b4c1d2', fontSize: 15, lineHeight: 21, marginVertical: 15 },
  primary: { backgroundColor: '#67dfbd', borderRadius: 15, padding: 17, alignItems: 'center' },
  primaryText: { color: '#06111d', fontSize: 18, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  stop: { backgroundColor: '#ff8b84', borderRadius: 15, padding: 17, alignItems: 'center' },
  stopText: { color: '#241010', fontSize: 18, fontWeight: '800' },
  guidanceCard: { backgroundColor: '#0d1a2b', borderRadius: 24, padding: 22, marginTop: 18 },
  guidance: { color: '#ffffff', fontSize: 25, lineHeight: 34, fontWeight: '700', marginTop: 13 },
  privacy: { color: '#8293aa', fontSize: 13, lineHeight: 19, marginTop: 18 },
  guidanceControls: { flexDirection: 'row', gap: 12, marginTop: 18 },
  secondary: { flex: 1, borderColor: '#405775', borderWidth: 1, borderRadius: 13, padding: 14, alignItems: 'center' },
  secondaryText: { color: '#f4f7fb', fontSize: 16, fontWeight: '700' },
});
