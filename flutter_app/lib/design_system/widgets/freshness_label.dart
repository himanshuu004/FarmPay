import 'package:flutter/material.dart';
import '../tokens.dart';

/// Honest "as of Xm ago" freshness indicator required by CLAUDE.md
/// Convention 27 (ERP filedrop can be degraded/daily) — every screen that
/// mirrors ERP- or cache-backed data (coop passbook/orders, CIA status)
/// must show this instead of implying live data.
class FreshnessLabel extends StatelessWidget {
  const FreshnessLabel({super.key, required this.syncedAt});

  final DateTime? syncedAt;

  String _relative(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final text = syncedAt == null
        ? 'not yet synced'
        : 'as of ${_relative(syncedAt!)}';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.sync, size: 12, color: AppColors.muted),
        const SizedBox(width: 4),
        Text(
          text,
          style: const TextStyle(
            fontSize: AppTextSizes.caption,
            color: AppColors.muted,
          ),
        ),
      ],
    );
  }
}
