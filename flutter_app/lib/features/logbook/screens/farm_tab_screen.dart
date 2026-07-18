import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/main_app_bar.dart';
import '../../../l10n/generated/app_localizations.dart';

/// Mirrors app/app/(tabs)/farm.tsx — pick a livestock activity. Dairy is
/// full-featured; goat/poultry route to the same v1-stub menu pattern the
/// RN reference app itself uses (see activity_goatery/poultry_screen.dart) —
/// reused dairy register/cost/revenue/P&L screens with a species filter,
/// plus an aggregate herd-count setup form, per CLAUDE.md's module map
/// (goatery/poultry = register + logbook + PoP, not dairy's full depth).
class FarmTabScreen extends StatelessWidget {
  const FarmTabScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const activities = [
      ('🐄', 'Dairy', 'Herd register · logbook · P&L', '/activity-dairy'),
      ('🐐', 'Goatery', 'Register, log costs & sales', '/activity-goatery'),
      ('🐔', 'Poultry', 'Flock, costs & sales', '/activity-poultry'),
    ];

    return Scaffold(
      appBar: MainAppBar(title: AppLocalizations.of(context).tabFarm),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          const Text(
            'Your logbook is your credit file — record daily, and it builds your KCC.',
            style: TextStyle(color: AppColors.muted, height: 1.4),
          ),
          const SizedBox(height: AppSpacing.lg),
          for (final a in activities)
            InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => context.push(a.$4),
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
                    Text(a.$1, style: const TextStyle(fontSize: 30)),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            a.$2,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: AppColors.brandDark,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            a.$3,
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
    );
  }
}
