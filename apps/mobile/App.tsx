import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { PhoneCaptureScreen } from './src/screens/PhoneCaptureScreen';
import { TutorialScreen } from './src/screens/TutorialScreen';

export default function App() {
  const [mode, setMode] = useState<'home' | 'capture' | 'tutorial'>('home');
  if (mode === 'capture') return <PhoneCaptureScreen onBack={() => setMode('home')} />;
  if (mode === 'tutorial') return <TutorialScreen onBack={() => setMode('home')} />;
  return (
    <SafeAreaView style={styles.safeArea}>
      <Text style={styles.eyebrow}>VISION CODEF</Text>
      <Text style={styles.title}>What are you doing?</Text>
      <Text style={styles.subtitle}>Choose one mode. The code on the laptop will connect the correct session.</Text>
      <View style={styles.choices}>
        <Pressable style={styles.primary} onPress={() => setMode('tutorial')}>
          <Text style={styles.choiceTitle}>Run tutorial</Text>
          <Text style={styles.choiceText}>Use approved guidance while you perform the task.</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => setMode('capture')}>
          <Text style={styles.choiceTitle}>Record expert run</Text>
          <Text style={styles.choiceText}>Capture a senior technician’s procedure for review.</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07111f', padding: 28, justifyContent: 'center' },
  eyebrow: { color: '#67dfbd', letterSpacing: 4, fontSize: 15, fontWeight: '700' },
  title: { color: '#f4f7fb', fontSize: 38, fontWeight: '800', marginTop: 10 },
  subtitle: { color: '#9eb0c7', fontSize: 17, lineHeight: 24, marginTop: 10 },
  choices: { gap: 16, marginTop: 34 },
  primary: { backgroundColor: '#1a856f', borderRadius: 24, padding: 24 },
  secondary: { backgroundColor: '#112238', borderColor: '#29415d', borderWidth: 1, borderRadius: 24, padding: 24 },
  choiceTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800' },
  choiceText: { color: '#d4dfeb', fontSize: 15, lineHeight: 21, marginTop: 7 },
});
