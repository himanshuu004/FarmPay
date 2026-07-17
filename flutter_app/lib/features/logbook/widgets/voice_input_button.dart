import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/utils/voice_input_service.dart';
import '../../../design_system/tokens.dart';

/// Flutter port of app/components/VoiceInputButton.tsx — tap to start
/// listening, tap again to stop; pulses while listening. Unlike the RN
/// original (web-only, silently renders nothing on real devices — see
/// voice_input_service.dart), this uses real on-device STT so the mic
/// actually works on iOS/Android.
class VoiceInputButton extends StatefulWidget {
  const VoiceInputButton({
    super.key,
    required this.onResult,
    this.language = 'en',
  });

  final ValueChanged<String> onResult;
  final String language;

  @override
  State<VoiceInputButton> createState() => _VoiceInputButtonState();
}

class _VoiceInputButtonState extends State<VoiceInputButton>
    with SingleTickerProviderStateMixin {
  bool _listening = false;
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse =
        AnimationController(
          vsync: this,
          duration: const Duration(milliseconds: 500),
        )..addStatusListener((status) {
          if (!_listening) return;
          if (status == AnimationStatus.completed) {
            _pulse.reverse();
          } else if (status == AnimationStatus.dismissed) {
            _pulse.forward();
          }
        });
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_listening) {
      await VoiceInputService.instance.stopListening();
      if (mounted) setState(() => _listening = false);
      _pulse.stop();
      return;
    }
    setState(() => _listening = true);
    unawaited(_pulse.forward());
    await VoiceInputService.instance.startListening(
      language: widget.language,
      onResult: (text) {
        widget.onResult(text);
        if (mounted) setState(() => _listening = false);
        _pulse.stop();
        _pulse.value = 0;
      },
      onError: (_) {
        if (mounted) setState(() => _listening = false);
        _pulse.stop();
        _pulse.value = 0;
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 8),
      child: GestureDetector(
        onTap: _toggle,
        child: ScaleTransition(
          scale: Tween(begin: 1.0, end: 1.3).animate(_pulse),
          child: Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _listening ? AppColors.dangerBg : const Color(0xFFF5F5F5),
              border: Border.all(
                color: _listening ? AppColors.danger : const Color(0xFFE0E0E0),
              ),
            ),
            child: Text(
              _listening ? '🔴' : '🎤',
              style: const TextStyle(fontSize: 18),
            ),
          ),
        ),
      ),
    );
  }
}
