import 'package:flutter/material.dart';

import '../../design_system/tokens.dart';

/// Honest placeholder for a tab whose feature module hasn't been built yet
/// in the current delivery phase (FLUTTER-CONVERSION-PRD.md §6 delivers
/// coop → logbook → KCC → insurance → CIA as separate vertical slices).
/// This is intentionally NOT a fake-data stub — it states plainly which
/// phase implements the tab, per the "no stub screens" rule: showing nothing
/// beats showing invented numbers.
class PhasePendingScreen extends StatelessWidget {
  const PhasePendingScreen({
    super.key,
    required this.title,
    required this.phaseLabel,
  });

  final String title;
  final String phaseLabel;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.construction_outlined,
                size: 40,
                color: AppColors.muted,
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                phaseLabel,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.muted, fontSize: 13),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
