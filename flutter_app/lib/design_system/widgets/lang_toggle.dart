import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers/locale_provider.dart';

/// Mirrors app/lib/i18n.tsx's `LangToggle` (`light` variant) — a compact
/// हिं | EN pill, shown in every main tab's header exactly like the RN
/// app's `headerRight` (set once via Tabs screenOptions there; here each
/// tab's AppBar includes it via MainAppBar).
class LangToggle extends ConsumerWidget {
  const LangToggle({super.key, this.light = false});

  final bool light;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(localeProvider).languageCode;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.6),
          width: 1.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final lang in const ['hi', 'en'])
            _pill(context, ref, lang: lang, on: current == lang),
        ],
      ),
    );
  }

  Widget _pill(
    BuildContext context,
    WidgetRef ref, {
    required String lang,
    required bool on,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => ref.read(localeProvider.notifier).setLang(lang),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: on ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          lang == 'hi' ? 'हिं' : 'EN',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: on
                ? const Color(0xFF0F7A4D)
                : Colors.white.withValues(alpha: 0.9),
          ),
        ),
      ),
    );
  }
}
