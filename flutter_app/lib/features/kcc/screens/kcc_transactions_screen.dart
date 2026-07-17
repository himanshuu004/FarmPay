import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/status_chip.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/kcc_status.dart';
import '../providers/kcc_providers.dart';

/// KCC transactions — synthesized from the 6-year limit schedule
/// (GET /kcc/facility) and the LT drawdown request list
/// (GET /kcc/facility/:uuid/drawdowns). CLAUDE.md's screen-group inventory
/// names a "transactions" screen but neither the RN app, the settled
/// prototype, nor the backend expose a single unified ledger endpoint for
/// it (see Phase-4 research §0/§6) — this view composes the two ledgers
/// that do exist rather than inventing a new statutory concept.
class KccTransactionsScreen extends ConsumerStatefulWidget {
  const KccTransactionsScreen({super.key});

  @override
  ConsumerState<KccTransactionsScreen> createState() => _KccTransactionsScreenState();
}

class _KccTransactionsScreenState extends ConsumerState<KccTransactionsScreen> {
  bool _loading = true;
  List<Map> _schedule = [];
  List<Map> _drawdowns = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final fac = await ref.read(kccApiProvider).getFacility();
      if (fac['success'] != true || fac['data']?['hasFacility'] != true) return;
      final data = fac['data'] as Map;
      final fu = data['facilityUuid'].toString();
      setState(() => _schedule = List<Map>.from(data['schedule'] ?? []));
      final dd = await ref.read(kccApiProvider).listDrawdowns(fu);
      if (dd['success'] == true) {
        setState(() => _drawdowns = List<Map>.from(dd['data']?['requests'] ?? []));
      }
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccTransactionsTitle)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_schedule.isEmpty && _drawdowns.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccTransactionsTitle)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(l10n.kccTransactionsEmpty, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.kccTransactionsTitle)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          if (_schedule.isNotEmpty)
            AppCard(
              title: l10n.kccTransactionsSchedule,
              child: Column(
                children: [
                  for (final row in _schedule)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '${l10n.kccYearWord} ${row['year_index']}',
                            style: const TextStyle(fontSize: 14, color: AppColors.ink),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                formatRupees(row['mpl']),
                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.brandDark),
                              ),
                              Text(
                                '${l10n.kccDrawingLimitWord} ${formatRupees(row['drawing_limit'])}',
                                style: const TextStyle(fontSize: 11, color: AppColors.muted),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),

          if (_drawdowns.isNotEmpty)
            AppCard(
              title: l10n.kccTransactionsDrawdowns,
              child: Column(
                children: [
                  for (final r in _drawdowns)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${r['item']} · ${r['description']}',
                                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink),
                                ),
                                Text(formatRupees(r['amount']), style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                              ],
                            ),
                          ),
                          StatusChip(
                            label: humanStatus((r['status'] ?? '').toString()),
                            tone: drawdownStatusTone((r['status'] ?? '').toString()),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
