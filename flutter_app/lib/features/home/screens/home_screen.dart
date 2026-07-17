import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../auth/providers/auth_providers.dart';

/// Home tab — passbook summary + limit card + renewal-due hero + advisory +
/// society/join-nudge card per CLAUDE.md's Shell/tabs group. The
/// passbook/limit/insurance cards land in Phases 2/4/5; Phase 1 wires the
/// real farmer profile (from /auth/me) and a join-society nudge only, so
/// nothing here is placeholder data — it's the real API response, just a
/// smaller slice of it.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  Map? _me;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ref.read(authApiProvider).getMe();
      if (res['success'] == true) {
        setState(() => _me = res['data']);
      }
    } catch (_) {
      // offline-tolerant: fall back to the last locally-known session user
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final session = ref.watch(sessionProvider);
    final name = _me?['firstName'] ?? session.user?['name'] ?? '';

    return Scaffold(
      appBar: AppBar(title: Text(l10n.authAppName)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            Text(
              '${l10n.homeGreeting}${name.isNotEmpty ? ", $name" : ""}',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 4),
            Text(
              l10n.homeRecordToday,
              style: const TextStyle(color: AppColors.muted),
            ),
            const SizedBox(height: AppSpacing.lg),
            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(),
                ),
              ),
            AppCard(
              title: 'My Society',
              child: Row(
                children: [
                  const Icon(Icons.groups_outlined, color: AppColors.brand),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(child: Text(l10n.homeJoinSociety)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
