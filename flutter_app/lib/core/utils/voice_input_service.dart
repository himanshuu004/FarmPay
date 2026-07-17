import 'package:speech_to_text/speech_to_text.dart' as stt;

/// On-device speech-to-text, replacing app/lib/voiceInput.ts. The RN app's
/// version only ever worked in a web build (it gates on `window.
/// SpeechRecognition`, so the mic button silently renders nothing on real
/// iOS/Android devices despite code comments suggesting native support) —
/// per IMPLEMENTATION-PROMPT.md this is reproduced with a real working
/// on-device package instead (`speech_to_text`), not the RN app's
/// effectively-broken-on-mobile behavior. No Bhashini account/API key
/// needed, matching the free on-device parity the prompt asked for.
class VoiceInputService {
  VoiceInputService._();
  static final VoiceInputService instance = VoiceInputService._();

  final _speech = stt.SpeechToText();
  bool _initialized = false;

  static const _langMap = {
    'en': 'en_IN',
    'hi': 'hi_IN',
    'te': 'te_IN',
    'kn': 'kn_IN',
    'ta': 'ta_IN',
    'mr': 'mr_IN',
    'gu': 'gu_IN',
    'bn': 'bn_IN',
    'ml': 'ml_IN',
    'pa': 'pa_IN',
    'or': 'or_IN',
  };

  Future<bool> isAvailable() async {
    if (_initialized) return _speech.isAvailable;
    _initialized = await _speech.initialize();
    return _initialized;
  }

  Future<void> startListening({
    required String language,
    required void Function(String text) onResult,
    required void Function(String error) onError,
  }) async {
    final available = await isAvailable();
    if (!available) {
      onError('Speech recognition is not available on this device.');
      return;
    }
    final localeId = _langMap[language] ?? 'en_IN';
    await _speech.listen(
      listenOptions: stt.SpeechListenOptions(
        partialResults: false,
        localeId: localeId,
      ),
      onResult: (result) {
        if (result.finalResult && result.recognizedWords.isNotEmpty) {
          onResult(result.recognizedWords);
        }
      },
    );
  }

  Future<void> stopListening() => _speech.stop();

  bool get isListening => _speech.isListening;
}
