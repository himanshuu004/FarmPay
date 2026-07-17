/**
 * Voice Input — Device-native speech-to-text using Web Speech API (browser)
 * and expo-speech (native). Free, no external API needed.
 *
 * Supports Indian languages: Hindi, Telugu, Kannada, Tamil, etc.
 */

// Language codes for Web Speech API (BCP 47 format)
const LANG_MAP: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  te: "te-IN",
  kn: "kn-IN",
  ta: "ta-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  bn: "bn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  or: "or-IN",
};

type VoiceCallback = (text: string) => void;
type ErrorCallback = (error: string) => void;

let recognition: any = null;
let isListening = false;

/**
 * Check if speech recognition is available on this device/browser.
 */
export function isVoiceAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

/**
 * Start listening for speech input.
 * @param language - Short language code (en, hi, te, kn, etc.)
 * @param onResult - Called with recognized text
 * @param onError - Called on error
 */
export function startListening(
  language: string = "en",
  onResult: VoiceCallback,
  onError?: ErrorCallback
): void {
  if (!isVoiceAvailable()) {
    onError?.("Speech recognition not available on this device");
    return;
  }

  if (isListening) {
    stopListening();
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  recognition = new SpeechRecognition();
  recognition.lang = LANG_MAP[language] || LANG_MAP.en;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript;
    isListening = false;
    onResult(text);
  };

  recognition.onerror = (event: any) => {
    isListening = false;
    const errorMsg =
      event.error === "no-speech"
        ? "No speech detected. Try again."
        : event.error === "not-allowed"
        ? "Microphone access denied. Allow microphone in browser settings."
        : `Voice error: ${event.error}`;
    onError?.(errorMsg);
  };

  recognition.onend = () => {
    isListening = false;
  };

  try {
    recognition.start();
    isListening = true;
  } catch (e) {
    onError?.("Could not start voice input");
  }
}

/**
 * Stop listening.
 */
export function stopListening(): void {
  if (recognition && isListening) {
    try {
      recognition.stop();
    } catch {}
    isListening = false;
  }
}

/**
 * Check if currently listening.
 */
export function getIsListening(): boolean {
  return isListening;
}
