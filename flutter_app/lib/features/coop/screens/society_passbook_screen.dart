import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/kpi_text.dart';
import '../../../design_system/widgets/limit_meter.dart';
import '../../../design_system/widgets/main_app_bar.dart';
import '../../../design_system/widgets/status_chip.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/coop_providers.dart';
import '../widgets/society_join_nudge_card.dart';

/// Milk passbook — THE WEDGE (V1 GTM). Mirrors app/app/society-passbook.tsx:
/// the only daily-pull surface, populated from the ERP mirror with zero
/// farmer data entry. Non-members get the join-society nudge, never a wall.
class SocietyPassbookScreen extends ConsumerStatefulWidget {
  const SocietyPassbookScreen({super.key});

  @override
  ConsumerState<SocietyPassbookScreen> createState() =>
      _SocietyPassbookScreenState();
}

class _SocietyPassbookScreenState extends ConsumerState<SocietyPassbookScreen> {
  bool _loading = true;
  Map? _pb;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(coopApiProvider).getPassbook();
      if (res['success'] == true) {
        setState(() => _pb = res['data']);
      }
    } catch (_) {
      // offline-tolerant: keep showing the last-loaded passbook, if any
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading && _pb == null) {
      return Scaffold(
        appBar: MainAppBar(title: l10n.tabSociety),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final pb = _pb;
    if (pb != null && pb['isMember'] == false) {
      return Scaffold(
        appBar: MainAppBar(title: l10n.tabSociety),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [SocietyJoinNudgeCard(nudge: pb['nudge'] as Map?)],
          ),
        ),
      );
    }

    final avail = (pb?['availableOrderLimit'] as num?)?.toDouble() ?? 0;
    final gross = (pb?['grossOrderLimit'] as num?)?.toDouble() ?? 1;
    final fill = gross == 0 ? 0.0 : (avail / gross).clamp(0.0, 1.0);
    final months = (pb?['months'] as List?) ?? const [];
    final freshness = pb?['freshness'] as String?;
    final outstanding = (pb?['outstandingPayables'] as num?) ?? 0;
    final inFlight = (pb?['inFlightOrders'] as num?) ?? 0;
    final totalValue = months.fold<num>(
      0,
      (s, m) => s + ((m['value'] as num?) ?? 0),
    );

    return Scaffold(
      appBar: MainAppBar(title: l10n.tabSociety),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            // Mirrors prototypes/society/index.html's "Milk passbook" card:
            // total received over the window + month count + freshness,
            // then the month-by-month table — the daily-pull surface.
            AppCard(
              title: l10n.homeMilkPassbook,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      KpiText(formatRupees(totalValue)),
                      const Spacer(),
                      StatusChip(
                        label: l10n.socMonthsChip(months.length),
                        tone: StatusTone.brand,
                      ),
                    ],
                  ),
                  if (freshness != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      freshness == 'live'
                          ? l10n.socFreshnessLive
                          : l10n.socFreshnessAsOfYesterday,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.warnAmber,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  if (months.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: Text(
                        l10n.socNoMilk,
                        style: const TextStyle(color: AppColors.muted),
                      ),
                    )
                  else ...[
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: Text(l10n.socColMonth, style: _thStyle),
                        ),
                        Expanded(
                          child: Text(
                            l10n.socColLitres,
                            style: _thStyle,
                            textAlign: TextAlign.right,
                          ),
                        ),
                        Expanded(
                          child: Text(
                            l10n.socColValue,
                            style: _thStyle,
                            textAlign: TextAlign.right,
                          ),
                        ),
                      ],
                    ),
                    const Divider(height: 16),
                    for (final m in months)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Expanded(
                              flex: 2,
                              child: Text(m['period'].toString()),
                            ),
                            Expanded(
                              child: Text(
                                m['litres'].toString(),
                                textAlign: TextAlign.right,
                              ),
                            ),
                            Expanded(
                              child: Text(
                                formatRupees(m['value'] as num?),
                                textAlign: TextAlign.right,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ],
              ),
            ),
            // Mirrors the prototype's "Input credit limit — 70% of milk
            // dues" card: outstanding dues, meter, available, the exact
            // math (never invented — echoes the server's own numbers), and
            // the primary CTA inside this card.
            AppCard(
              title: l10n.socInputCredit,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        l10n.socOutstandingDues,
                        style: const TextStyle(color: AppColors.muted),
                      ),
                      Text(
                        formatRupees(outstanding),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  LimitMeter(fraction: fill),
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        l10n.socAvailableToOrder,
                        style: const TextStyle(color: AppColors.muted),
                      ),
                      Text(
                        formatRupees(avail),
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppColors.brandDark,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    l10n.socLimitMathNote(
                      formatRupees(outstanding),
                      formatRupees(inFlight),
                    ),
                    style: const TextStyle(
                      color: AppColors.muted,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  ElevatedButton(
                    onPressed: () => context.push('/society-order'),
                    child: Text(l10n.socOrderInputs),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    l10n.socRepaidNote,
                    style: const TextStyle(
                      color: AppColors.muted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            OutlinedButton(
              onPressed: () => context.push('/society-orders'),
              child: Text(l10n.socMyOrders),
            ),
            const SizedBox(height: AppSpacing.md),
            InkWell(
              borderRadius: BorderRadius.circular(AppRadii.card),
              onTap: () => context.push('/kcc'),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.lg),
                margin: const EdgeInsets.only(bottom: AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.blueBg,
                  borderRadius: BorderRadius.circular(AppRadii.card),
                  border: Border.all(
                    color: AppColors.blue.withValues(alpha: 0.25),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.socKccCtaTitle,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.blue,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n.socKccCtaText,
                      style: const TextStyle(
                        color: AppColors.blue,
                        fontSize: 13,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

const _thStyle = TextStyle(
  fontSize: 12,
  color: AppColors.muted,
  fontWeight: FontWeight.w600,
);
