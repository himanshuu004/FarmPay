import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/main_app_bar.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../advisory/providers/advisory_providers.dart';
import '../../auth/providers/auth_providers.dart';
import '../../coop/providers/coop_providers.dart';
import '../../insurance/providers/insurance_providers.dart';
import '../../kcc/providers/kcc_providers.dart';

/// Home — built around the farmer's daily loop, not the product narrative.
/// Mirrors app/app/(tabs)/index.tsx exactly: two big primary daily-action
/// buttons (log milk / log expense) up top, quick actions, a today
/// snapshot, urgent alerts, then the less-frequent journeys (passbook,
/// KCC, CIA, insurance) as compact cards.
///
/// Every card here reads real data from its own module's API — nothing is
/// invented. Cards whose module hasn't shipped yet (dairy quick-actions in
/// Phase 3, KCC/insurance/CIA detail in Phases 4-6) still render with the
/// RN app's exact copy/layout, but route to an honest "ships in Phase N"
/// screen rather than fake numbers.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _loading = true;
  String _name = '';
  Map? _pb;
  Map? _kcc;
  Map? _protectionSnapshot;
  int _renewalsDue = 0;
  Map? _urgent;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final session = ref.read(sessionProvider);
      _name = (session.user?['name'] as String?) ?? '';

      final results = await Future.wait([
        ref.read(coopApiProvider).getPassbook(),
        ref.read(kccApiProvider).getFacility(),
        ref.read(insuranceApiProvider).policiesMe(),
        ref.read(insuranceApiProvider).renewalsDue(),
        ref
            .read(advisoryApiProvider)
            .feed(status: 'OPEN')
            .catchError((_) => {'success': false}),
      ]);

      final pb = results[0];
      final kcc = results[1];
      final protection = results[2];
      final renewals = results[3];
      final advisory = results[4];

      if (pb['success'] == true) _pb = pb['data'];
      if (kcc['success'] == true) _kcc = kcc['data'];
      if (protection['success'] == true) {
        _protectionSnapshot = protection['data']?['snapshot'];
      }
      if (renewals['success'] == true) {
        _renewalsDue = ((renewals['data'] as List?) ?? []).length;
      }
      if (advisory['success'] == true) {
        final items = (advisory['data'] as List?) ?? [];
        _urgent = items.cast<Map?>().firstWhere(
          (x) => x?['severity'] == 'URGENT',
          orElse: () => null,
        );
      }
    } catch (_) {
      // offline-tolerant: keep whatever was already loaded
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: MainAppBar(title: l10n.authAppName),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final isMember = _pb != null && _pb!['isMember'] != false;
    final availLimit = (_pb?['availableOrderLimit'] as num?) ?? 0;
    final hasFacility = _kcc?['hasFacility'] == true;

    return Scaffold(
      appBar: MainAppBar(title: l10n.authAppName),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            Text(
              '${l10n.homeGreeting}${_name.isNotEmpty ? ", $_name" : ""} 🙏',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 4),
            Text(
              l10n.homeRecordToday,
              style: const TextStyle(color: AppColors.muted),
            ),
            const SizedBox(height: AppSpacing.lg),

            // ── Primary daily actions ──
            Row(
              children: [
                Expanded(
                  child: _PrimaryAction(
                    icon: '🥛',
                    label: l10n.homeLogMilk,
                    filled: true,
                    onTap: () => context.push('/dairy-log-revenue'),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: _PrimaryAction(
                    icon: '💰',
                    label: l10n.homeLogExpense,
                    filled: false,
                    onTap: () => context.push('/dairy-log-cost'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),

            // ── Quick actions ──
            Row(
              children: [
                Expanded(
                  child: _QuickAction(
                    icon: '📒',
                    label: l10n.homeLogbook,
                    onTap: () => context.push('/dairy-logbook'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _QuickAction(
                    icon: '🐄',
                    label: l10n.homeAnimals,
                    onTap: () => context.push('/dairy-animals'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _QuickAction(
                    icon: '💊',
                    label: l10n.homeTreatment,
                    onTap: () => context.push('/dairy-treatment'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),

            // ── Today snapshot ──
            if (isMember)
              InkWell(
                borderRadius: BorderRadius.circular(AppRadii.card),
                onTap: () => context.go('/society'),
                child: Container(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  margin: const EdgeInsets.only(bottom: AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(AppRadii.card),
                    border: Border.all(color: AppColors.line),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: _snapshotCol(
                          formatRupees(availLimit),
                          l10n.homeCreditReady,
                        ),
                      ),
                      Container(width: 1, height: 40, color: AppColors.line),
                      Expanded(
                        child: _snapshotCol(
                          formatRupees(
                            (_pb?['outstandingPayables'] as num?) ?? 0,
                          ),
                          l10n.homeMilkDues,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // ── Alerts ──
            if (_urgent != null)
              _AlertCard(
                tone: StatusTone.danger,
                icon: '🚨',
                text:
                    '${_urgent!['animalLabel'] != null ? "${_urgent!['animalLabel']}: " : ""}${_urgent!['title']}',
                onTap: () => context.push('/dairy-treatment'),
              ),
            if (_renewalsDue > 0)
              _AlertCard(
                tone: StatusTone.warn,
                icon: '⏳',
                text: '$_renewalsDue ${l10n.homeRenewalDue}',
                onTap: () => context.push('/pashu-renew'),
              ),

            // ── Journeys ──
            Padding(
              padding: const EdgeInsets.only(
                top: AppSpacing.sm,
                bottom: AppSpacing.sm,
              ),
              child: Text(
                l10n.homeMyAccounts.toUpperCase(),
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.muted,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            _JourneyCard(
              icon: '🥛',
              title: l10n.homeMilkPassbook,
              subtitle: isMember
                  ? ((_pb?['freshness'] as String?) ?? l10n.homePassbookSub)
                  : l10n.homeJoinSociety,
              onTap: () => context.go('/society'),
            ),
            _JourneyCard(
              icon: '💳',
              title: hasFacility
                  ? '${formatRupees((_kcc?['cmpl'] as num?) ?? 0)} ${l10n.homeKccLimit}'
                  : l10n.homeYourKcc,
              subtitle: hasFacility
                  ? (_kcc?['status'] as String? ?? '')
                        .replaceAll('_', ' ')
                        .toLowerCase()
                  : l10n.homeKccUnlock,
              onTap: () => context.go('/kcc'),
            ),
            _JourneyCard(
              icon: '🐄',
              title: l10n.homeCiaTitle,
              subtitle: l10n.homeCiaSub,
              onTap: () => context.push('/cia-schemes'),
            ),
            _JourneyCard(
              icon: '🛡️',
              title: l10n.homeAnimalInsurance,
              subtitle:
                  '${(_protectionSnapshot?['label'] as String?) ?? l10n.homeProtect} · ${l10n.homeOnceASeason}',
              onTap: () => context.go('/suraksha'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _snapshotCol(String value, String label) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: AppColors.brandDark,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 11, color: AppColors.muted),
        ),
      ],
    );
  }
}

class _PrimaryAction extends StatelessWidget {
  const _PrimaryAction({
    required this.icon,
    required this.label,
    required this.filled,
    required this.onTap,
  });

  final String icon;
  final String label;
  final bool filled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Container(
        height: 128,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled ? AppColors.brand : AppColors.card,
          borderRadius: BorderRadius.circular(18),
          border: filled ? null : Border.all(color: AppColors.brand, width: 2),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(icon, style: const TextStyle(fontSize: 40)),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: filled ? Colors.white : AppColors.brand,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final String icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.line),
        ),
        child: Column(
          children: [
            Text(icon, style: const TextStyle(fontSize: 26)),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.brandDark,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({
    required this.tone,
    required this.icon,
    required this.text,
    required this.onTap,
  });

  final StatusTone tone;
  final String icon;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: StatusColors.bg(tone),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: StatusColors.fg(tone).withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            children: [
              Text(icon, style: const TextStyle(fontSize: 20)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  text,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: StatusColors.fg(tone),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _JourneyCard extends StatelessWidget {
  const _JourneyCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final String icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              Text(icon, style: const TextStyle(fontSize: 24)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brandDark,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.line, size: 24),
            ],
          ),
        ),
      ),
    );
  }
}
