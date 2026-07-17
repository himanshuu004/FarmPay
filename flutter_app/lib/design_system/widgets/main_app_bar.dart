import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/core_providers.dart';
import '../../features/auth/providers/auth_providers.dart';
import '../../l10n/generated/app_localizations.dart';
import 'lang_toggle.dart';

/// Shared AppBar for every main-tab screen — mirrors the RN app's
/// `headerRight: () => <LangToggle light />`, set once via Tabs
/// screenOptions there so it appears on all 5 tabs uniformly. Flutter has
/// no per-navigator screenOptions equivalent for individually-Scaffolded
/// tab screens, so each tab includes this instead.
///
/// Also adds a sign-out action. The RN reference has apiLogout() in
/// api.ts but it's never wired to any button in the app — a real gap in
/// the reference, not a deliberate design call — and there's no
/// profile/settings screen in the RN screen inventory to home it in
/// either, so it lives here as the one place every tab already visits.
class MainAppBar extends ConsumerWidget implements PreferredSizeWidget {
  const MainAppBar({super.key, required this.title});

  final String title;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.authSignOutConfirmTitle),
        content: Text(l10n.authSignOutConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.authSignOut),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      final store = ref.read(secureStoreProvider);
      final refreshToken = await store.getRefreshToken();
      await ref.read(authApiProvider).logout(refreshToken: refreshToken);
    } catch (_) {
      // Best-effort, mirrors apiLogout()'s comment in app/lib/api.ts: if the
      // network call fails we still clear local state so the farmer can
      // sign in fresh.
    }
    await ref.read(sessionProvider.notifier).clear();
    if (context.mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppBar(
      title: Text(title),
      actions: [
        const LangToggle(light: true),
        const SizedBox(width: 4),
        IconButton(
          icon: const Icon(Icons.logout),
          tooltip: AppLocalizations.of(context).authSignOut,
          onPressed: () => _signOut(context, ref),
        ),
      ],
    );
  }
}
