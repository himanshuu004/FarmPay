import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';

/// Mirrors app/app/activity-poultry.tsx — same v1-stub menu pattern as
/// Goatery (see activity_goatery_screen.dart's doc comment), plus an
/// honest "coming soon" note RN itself shows below the cards.
class ActivityPoultryScreen extends StatelessWidget {
  const ActivityPoultryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final links = [
      ('🐔', l10n.dairyPoultryAnimals, l10n.dairyPoultryAnimalsDesc, '/dairy-animals?species=POULTRY'),
      ('💸', l10n.dairyPoultryLogCost, l10n.dairyPoultryLogCostDesc, '/dairy-log-cost'),
      ('💰', l10n.dairyPoultryLogSale, l10n.dairyPoultryLogSaleDesc, '/dairy-log-revenue'),
      ('📊', l10n.dairyPoultryPnl, l10n.dairyPoultryPnlDesc, '/dairy-pnl'),
      ('✏️', l10n.dairyPoultryEdit, l10n.dairyPoultryEditDesc, '/setup-poultry?mode=edit'),
    ];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.dairyPoultryTitle)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Text('🐔', style: TextStyle(fontSize: 34)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.dairyPoultryTitle,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFFE65100)),
                    ),
                    Text(l10n.dairyPoultrySub, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          for (final link in links) _card(context, link),
          Container(
            padding: const EdgeInsets.all(16),
            margin: const EdgeInsets.only(top: 8),
            decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(12)),
            child: Text(
              l10n.dairyPoultryComingSoon,
              style: const TextStyle(fontSize: 13, color: AppColors.warnAmber, height: 1.35),
            ),
          ),
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
