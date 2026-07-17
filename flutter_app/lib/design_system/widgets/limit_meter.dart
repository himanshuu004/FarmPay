import 'package:flutter/material.dart';
import '../tokens.dart';

/// Mirrors `.meter` in the prototypes — used for the coop 70%-of-payables
/// order meter and the KCC drawing-power meter. `fraction` must already be
/// clamped/computed server-side; this widget only renders it.
class LimitMeter extends StatelessWidget {
  const LimitMeter({super.key, required this.fraction, this.height = 14});

  final double fraction;
  final double height;

  @override
  Widget build(BuildContext context) {
    final clamped = fraction.clamp(0.0, 1.0);
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: height,
        color: AppColors.meterBg,
        alignment: Alignment.centerLeft,
        child: FractionallySizedBox(
          widthFactor: clamped,
          child: Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.brand, AppColors.brandDark],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
