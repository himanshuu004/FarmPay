import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../api/dairy_api.dart';
import '../providers/dairy_providers.dart';
import '../widgets/form_kit.dart' show todayYMD, shiftYMD;

/// Mirrors app/app/dairy-logbook.tsx — the logbook hub: 14-day P&L
/// snapshot, herd card, 6-item quick-actions grid. If no dairy profile
/// exists yet, shows the setup-first empty state (routes to onboarding).
class DairyLogbookScreen extends ConsumerStatefulWidget {
  const DairyLogbookScreen({super.key});

  @override
  ConsumerState<DairyLogbookScreen> createState() => _DairyLogbookScreenState();
}

class _DairyLogbookScreenState extends ConsumerState<DairyLogbookScreen> {
  bool _loading = true;
  Map? _profile;
  List<Map> _animals = [];
  Map? _pnl;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(dairyApiProvider);
      final profileRes = await api.getProfile();
      if (profileRes['success'] == true) _profile = profileRes['data'];

      final animalsRes = await api.listAnimals();
      if (animalsRes['success'] == true)
        _animals = List<Map>.from(animalsRes['data'] ?? []);

      final start = shiftYMD(todayYMD(), -14);
      final end = todayYMD();
      final pnlRes = await api.getHerdPnl(startDate: start, endDate: end);
      if (pnlRes['success'] == true) _pnl = pnlRes['data'];
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.dairyLogTitle)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_profile == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.dairyLogTitle)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🐄', style: TextStyle(fontSize: 64)),
                const SizedBox(height: 12),
                Text(
                  l10n.dairyLogSetupFirstTitle,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: () => context.push('/dairy-onboarding'),
                  child: Text(l10n.dairyLogStartSetup),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final totalCost = parseNum(_pnl?['totalCost']);
    final totalRev = parseNum(_pnl?['totalRevenue']);
    final net = totalRev - totalCost;
    final netColor = net >= 0 ? AppColors.brandDark : AppColors.danger;
    final lactating = _animals
        .where(
          (a) => (a['current_lifecycle_stage'] as String? ?? '').contains(
            'LACTATION',
          ),
        )
        .length;
    final pregnant = _animals
        .where((a) => a['current_lifecycle_stage'] == 'PREGNANT')
        .length;
    final isWeekly = _profile?['entry_mode'] == 'WEEKLY_BULK';

    final actions = [
      ('🥛', l10n.dairyLogActMilk, '/dairy-log-revenue'),
      ('💰', l10n.dairyLogActExpense, '/dairy-log-cost'),
      ('🐄', l10n.dairyLogActAnimals, '/dairy-animals'),
      ('💉', l10n.dairyLogActVet, '/dairy-treatment'),
      ('🤰', l10n.dairyLogActBreeding, '/dairy-breeding'),
      ('📊', l10n.dairyLogActPnl, '/dairy-pnl'),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.dairyLogTitle),
        actions: [
          IconButton(
            icon: const Text('⚙️'),
            onPressed: () => context.push('/dairy-onboarding'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: AppColors.brandDark,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Text('🐄', style: TextStyle(fontSize: 32)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.dairyLogTitle,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          '${_profile?['herd_tier'] ?? ''} ${l10n.dairyLogTier} · ${isWeekly ? l10n.dairyLogEntryWeekly : l10n.dairyLogEntryDaily} ${l10n.dairyLogEntryWord}',
                          style: const TextStyle(
                            color: Color(0xFFA5D6A7),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.dairyLogLast14,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.muted,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      Expanded(
                        child: _pnlBox(
                          l10n.dairyLogRevenue,
                          formatRupees(totalRev),
                          AppColors.brandDark,
                        ),
                      ),
                      Expanded(
                        child: _pnlBox(
                          l10n.dairyLogCost,
                          formatRupees(totalCost),
                          AppColors.danger,
                        ),
                      ),
                      Expanded(
                        child: _pnlBox(
                          l10n.dairyLogNet,
                          formatRupees(net),
                          netColor,
                        ),
                      ),
                    ],
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => context.push('/dairy-pnl'),
                      child: Text(l10n.dairyLogViewFullPnl),
                    ),
                  ),
                ],
              ),
            ),
            InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => context.push('/dairy-animals'),
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.lg),
                margin: const EdgeInsets.only(top: AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.dairyLogMyHerd,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.muted,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        Text(
                          '${_animals.length}',
                          style: const TextStyle(
                            fontSize: 36,
                            fontWeight: FontWeight.w900,
                            color: AppColors.brandDark,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l10n.dairyLogAnimalsActive,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(
                                '$lactating ${l10n.dairyLogLactating} · $pregnant ${l10n.dairyLogPregnant}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right, color: AppColors.brand),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              child: Text(
                l10n.dairyLogQuickActions,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final a in actions)
                  FractionallySizedBox(
                    widthFactor: 0.31,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () => context.push(a.$3),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: AppColors.card,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.accent),
                        ),
                        child: Column(
                          children: [
                            Text(a.$1, style: const TextStyle(fontSize: 26)),
                            const SizedBox(height: 6),
                            Text(
                              a.$2,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _pnlBox(String label, String value, Color color) => Container(
    margin: const EdgeInsets.symmetric(horizontal: 4),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFFFAFAFA),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Column(
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 11, color: AppColors.muted),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
      ],
    ),
  );
}
