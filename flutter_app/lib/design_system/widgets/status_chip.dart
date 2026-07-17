import 'package:flutter/material.dart';
import '../tokens.dart';

/// Mirrors `.chip` / `.chip.gold` / `.chip.blue` / `.chip.warn` in the
/// prototypes. `tone` must be picked from [StatusTone] — never a raw color —
/// so every state-machine enum in the app maps to one of a fixed palette.
class StatusChip extends StatelessWidget {
  const StatusChip({
    super.key,
    required this.label,
    this.tone = StatusTone.brand,
  });

  final String label;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: StatusColors.bg(tone),
        borderRadius: BorderRadius.circular(AppRadii.chip),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: AppTextSizes.caption,
          fontWeight: FontWeight.w700,
          color: StatusColors.fg(tone),
        ),
      ),
    );
  }
}
