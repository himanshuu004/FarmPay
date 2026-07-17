import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';

/// Mirrors app/app/activity-dairy.tsx — the dairy activity hub: 4 nav
/// cards (animals/logbook/treatment/P&L) + a sticky bottom bar linking to
/// the coop screens. ActivityMoneySection (bank-loan bookmarks) isn't
/// built — no Flutter equivalent exists yet and it's outside this dairy
/// logbook phase's scope (KCC/loans land in Phase 4).
class ActivityDairyScreen extends StatelessWidget {
  const ActivityDairyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final links = [
      ('🐄', l10n.dairyHubAnimals, l10n.dairyHubAnimalsDesc, '/dairy-animals'),
      ('📒', l10n.dairyHubLogbook, l10n.dairyHubLogbookDesc, '/dairy-logbook'),
      (
        '💊',
        l10n.dairyHubTreatment,
        l10n.dairyHubTreatmentDesc,
        '/dairy-treatment',
      ),
      ('📈', l10n.dairyHubPnl, l10n.dairyHubPnlDesc, '/dairy-pnl'),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.dairyHubTitle),
        actions: [
          TextButton(
            onPressed: () => context.push('/setup-dairy?mode=edit'),
            child: Text(
              l10n.dairyHubEditHerd,
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.lg,
          100,
        ),
        children: [
          Text(
            l10n.dairyHubSub,
            style: const TextStyle(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.md),
          for (final l in links)
            InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => context.push(l.$4),
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.lg),
                margin: const EdgeInsets.only(bottom: AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.line),
                ),
                child: Row(
                  children: [
                    Text(l.$1, style: const TextStyle(fontSize: 30)),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l.$2,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: AppColors.brandDark,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            l.$3,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: AppColors.line),
                  ],
                ),
              ),
            ),
        ],
      ),
      bottomSheet: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: const BoxDecoration(
          color: AppColors.card,
          border: Border(top: BorderSide(color: AppColors.line)),
        ),
        child: Row(
          children: [
            Expanded(
              child: ElevatedButton(
                onPressed: () => context.go('/society'),
                child: Text(l10n.dairyHubMySociety),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.blue,
                ),
                onPressed: () => context.push('/society-orders'),
                child: Text(l10n.dairyHubMyOrders),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
