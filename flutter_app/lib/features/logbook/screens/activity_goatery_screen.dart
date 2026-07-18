import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';

/// Mirrors app/app/activity-goatery.tsx — a v1 stub menu (RN's own doc
/// comment: "Persona phase v1 stub") that reuses the shared dairy animal
/// register / cost / revenue / P&L screens with a species filter, rather
/// than dedicated goatery screens (none exist in RN, the backend, or the
/// prototypes — see CLAUDE.md's module map: goatery is register+logbook+
/// PoP, not full dairy-depth breeding/treatment). Previously a bare
/// "ships later" placeholder in Flutter, which was a step down from even
/// RN's own stub — this restores RN parity.
class ActivityGoateryScreen extends StatelessWidget {
  const ActivityGoateryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final links = [
      ('🐐', l10n.dairyGoateryAnimals, l10n.dairyGoateryAnimalsDesc, '/dairy-animals?species=GOAT'),
      ('💸', l10n.dairyGoateryLogCost, l10n.dairyGoateryLogCostDesc, '/dairy-log-cost'),
      ('💰', l10n.dairyGoateryLogSale, l10n.dairyGoateryLogSaleDesc, '/dairy-log-revenue'),
      ('📊', l10n.dairyGoateryPnl, l10n.dairyGoateryPnlDesc, '/dairy-pnl'),
      ('✏️', l10n.dairyGoateryEdit, l10n.dairyGoateryEditDesc, '/setup-goatery?mode=edit'),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.dairyGoateryTitle)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Text('🐐', style: TextStyle(fontSize: 34)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.dairyGoateryTitle,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF6A1B9A)),
                    ),
                    Text(l10n.dairyGoaterySub, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          for (final link in links) _card(context, link),
        ],
      ),
    );
  }

  Widget _card(BuildContext context, (String, String, String, String) link) {
    final (icon, title, desc, route) = link;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => context.push(route),
      child: Container(
        padding: const EdgeInsets.all(16),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          children: [
            Text(icon, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.ink)),
                  Text(desc, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ],
              ),
            ),
            const Text('›', style: TextStyle(fontSize: 22, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}
