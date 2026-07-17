import 'package:flutter/material.dart';
import '../tokens.dart';

/// Mirrors `.kpi` / `.kpi.small` — the large rupee/number display used on
/// passbook, limit dashboard, and quote cards.
class KpiText extends StatelessWidget {
  const KpiText(
    this.value, {
    super.key,
    this.small = false,
    this.color = AppColors.ink,
  });

  final String value;
  final bool small;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Text(
      value,
      style: TextStyle(
        fontSize: small ? AppTextSizes.kpiSmall : AppTextSizes.kpi,
        fontWeight: FontWeight.w800,
        color: color,
      ),
    );
  }
}
