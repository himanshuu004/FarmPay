import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/secure_store.dart';

/// App language — mirrors app/lib/i18n.tsx's LanguageProvider: Hindi-first
/// default, persisted (SecureStore's fp_lang key, matching the RN app's
/// AsyncStorage key), togglable anywhere via [LangToggle].
class LocaleController extends Notifier<Locale> {
  @override
  Locale build() => const Locale('hi');

  Future<void> hydrate() async {
    final saved = await SecureStore.instance.getLang();
    if (saved == 'en' || saved == 'hi') state = Locale(saved!);
  }

  Future<void> setLang(String lang) async {
    state = Locale(lang);
    await SecureStore.instance.setLang(lang);
  }
}

final localeProvider = NotifierProvider<LocaleController, Locale>(
  LocaleController.new,
);
