import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers/locale_provider.dart';
import 'design_system/theme.dart';
import 'features/auth/providers/auth_providers.dart';
import 'l10n/generated/app_localizations.dart';
import 'routes/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: AlliedKccApp()));
}

class AlliedKccApp extends ConsumerStatefulWidget {
  const AlliedKccApp({super.key});

  @override
  ConsumerState<AlliedKccApp> createState() => _AlliedKccAppState();
}

class _AlliedKccAppState extends ConsumerState<AlliedKccApp> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(sessionProvider.notifier).hydrate();
      ref.read(localeProvider.notifier).hydrate();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(localeProvider);
    return MaterialApp.router(
      title: 'Allied KCC',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: router,
      locale: locale,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
