import 'package:flutter/material.dart';

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../l10n/generated/app_localizations.dart';

/// The non-member acquisition funnel — shown instead of a wall wherever a
/// /coop/* endpoint returns `{isMember: false, nudge: {...}}}` (passbook,
/// orders list). Never a dead end for a non-member per CLAUDE.md's product
/// thesis: non-members are supported, not blocked.
class SocietyJoinNudgeCard extends StatelessWidget {
  const SocietyJoinNudgeCard({super.key, this.nudge});

  final Map? nudge;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            nudge?['title'] ?? l10n.socNudgeTitle,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            nudge?['body'] ?? l10n.socNudgeBody,
            style: const TextStyle(color: AppColors.muted, height: 1.4),
          ),
          const SizedBox(height: AppSpacing.lg),
          // No backend endpoint exists yet to search/select a society to
          // link (membershipService.linkUser needs a farmerRef the app has
          // no picker for) — disabled rather than faking a flow that isn't
          // wired up. Matches app/app/society-passbook.tsx's RN reference,
          // whose equivalent button also has no onPress handler.
          ElevatedButton(
            onPressed: null,
            child: Text(nudge?['cta'] ?? l10n.socNudgeCta),
          ),
        ],
      ),
    );
  }
}
