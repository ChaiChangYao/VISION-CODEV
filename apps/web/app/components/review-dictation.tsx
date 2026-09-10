'use client';
import { useEffect, useRef, useState } from 'react';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
export function ReviewDictation({
  onText,
  disabled,
  language,
}: {
  onText: (text: string) => void;
  disabled: boolean;
  language: string;
}) {
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  callback.current = onText;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const host = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    setSupported(Boolean(Constructor));
    if (!Constructor) return;
    const current = new Constructor();
    recognition.current = current;
    current.lang = language;
    current.continuous = false;
    current.interimResults = false;
    current.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) callback.current(text);
    };
    current.onerror = () =>
      setMessage('Dictation unavailable or permission denied. You can still type your note.');
    current.onend = () => setListening(false);
    return () => {
      current.onresult = null;
      current.onend = null;
      current.onerror = null;
      current.abort();
      recognition.current = null;
    };
  }, [language]);
  useEffect(() => {
    if (disabled) {
      recognition.current?.abort();
      setListening(false);
    }
  }, [disabled]);
  return (
    <details>
      <summary>Speak a note (optional)</summary>
      <small>
        Browser dictation may send audio to its speech service. Start only if permitted for this
        recording. Check the transcript and technical terms before saving. Audio is not stored by
        this app.
      </small>
      {supported ? (
        <button
          disabled={disabled}
          onClick={() => {
            if (listening) {
              recognition.current?.abort();
              setListening(false);
              return;
            }
            setMessage('');
            try {
              recognition.current?.start();
              setListening(true);
            } catch {
              setMessage('Could not start dictation. Try again or type instead.');
            }
          }}
        >
          {listening ? 'Stop dictation' : 'Start dictation'}
        </button>
      ) : (
        <p>
          Dictation is not available in this browser. Type instead, or use your device’s keyboard
          dictation.
        </p>
      )}
      <p role="status">{message || (listening ? 'Listening…' : '')}</p>
    </details>
  );
}
