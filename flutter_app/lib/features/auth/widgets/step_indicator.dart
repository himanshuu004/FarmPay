import 'package:flutter/material.dart';

import '../../../design_system/tokens.dart';

class StepIndicator extends StatelessWidget {
  const StepIndicator({super.key, required this.labels, required this.current});

  final List<String> labels;
  final int current; // 1-indexed

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: List.generate(labels.length, (i) {
          final step = i + 1;
          final done = step < current;
          final active = step == current;
          final circleColor = done || active ? AppColors.brand : AppColors.line;
          return Column(
            children: [
              CircleAvatar(
                radius: 16,
                backgroundColor: circleColor,
                child: Text(
                  '$step',
                  style: TextStyle(
                    color: done || active ? Colors.white : AppColors.muted,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                labels[i],
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                  color: active ? AppColors.brandDark : AppColors.muted,
                ),
              ),
            ],
          );
        }),
      ),
    );
  }
}
