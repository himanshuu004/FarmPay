import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/status_chip.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/insurance_status.dart';
import '../providers/insurance_providers.dart';

/// Pashu Suraksha — policy vault. The issued cover delivered to the FARMER
/// (never parked with the VO — Convention 12): cover summary, insured
/// animals, premium trail, waiting-period status. Mirrors
/// app/app/pashu-vault.tsx.
class PashuVaultScreen extends ConsumerStatefulWidget {
  const PashuVaultScreen({super.key, this.policyUuid});

  final String? policyUuid;

  @override
  ConsumerState<PashuVaultScreen> createState() => _PashuVaultScreenState();
}

class _PashuVaultScreenState extends ConsumerState<PashuVaultScreen> {
  bool _loading = true;
  Map? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (widget.policyUuid == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await ref.read(insuranceApiProvider).getPolicy(widget.policyUuid!);
      if (res['success'] == true) setState(() => _data = res['data']);
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openDoc() {
    final l10n = AppLocalizations.of(context);
    final p = _data?['policy'] as Map?;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(p?['policy_doc_url'] != null ? l10n.pashuVaultDocTitle : l10n.pashuVaultNotReady),
        content: Text(p?['policy_doc_url'] != null ? l10n.pashuVaultDocOpening : l10n.pashuVaultDocPending),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(l10n.commonOk))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.pashuVaultSumInsured)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final p = _data?['policy'] as Map?;
    if (p == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.pashuVaultSumInsured)),
        body: Center(child: Text(l10n.pashuVaultNotFound, style: const TextStyle(color: AppColors.muted))),
      );
    }

    final assets = (_data?['assets'] as List?) ?? const [];
    final ledger = (_data?['premiumLedger'] as List?) ?? const [];
    final waitingUntil = DateTime.tryParse((p['waiting_until'] ?? '').toString());
    final inWaiting = waitingUntil != null && waitingUntil.isAfter(DateTime.now());
    final status = (p['status'] ?? '').toString();

    return Scaffold(
      appBar: AppBar(title: Text(l10n.pashuVaultSumInsured)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        l10n.pashuVaultSumInsured.toUpperCase(),
                        style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700),
                      ),
                      StatusChip(label: status, tone: policyStatusTone(status)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    formatRupees(p['sum_insured']),
                    style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                  ),
                  _row(l10n.pashuVaultYouPay, formatRupees(p['premium_farmer'])),
                  _row(l10n.pashuVaultTotalPremium, formatRupees(p['premium_total'])),
                  _row(l10n.pashuVaultCover, '${p['start_date'] ?? '—'} → ${p['end_date'] ?? '—'}'),
                  if (p['policy_number'] != null) _row(l10n.pashuVaultPolicyNo, p['policy_number'].toString()),
                  if (p['insurer_name'] != null) _row(l10n.pashuVaultInsurer, p['insurer_name'].toString()),
                ],
              ),
            ),

            if (inWaiting)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(AppSpacing.md),
                margin: const EdgeInsets.only(bottom: AppSpacing.md),
                decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(AppRadii.button)),
                child: Text(
                  '${l10n.pashuVaultWaitingPre} ${(p['waiting_until'] ?? '').toString().substring(0, 10)}. ${l10n.pashuVaultWaitingPost}',
                  style: const TextStyle(color: AppColors.warnAmber, fontSize: 13, height: 1.35, fontWeight: FontWeight.w600),
                ),
              ),

            AppCard(
              title: l10n.pashuVaultInsuredAnimals,
              child: assets.isEmpty
                  ? Text(l10n.pashuVaultNoAnimalsLinked, style: const TextStyle(color: AppColors.muted))
                  : Column(
                      children: [
                        for (final a in assets)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        (a as Map)['tag_uid'] != null ? 'UID ${a['tag_uid']}' : l10n.pashuAnimalWord,
                                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink),
                                      ),
                                      Text(
                                        '${l10n.pashuVaultValued} ${formatRupees(a['valuation'] ?? 0)}',
                                        style: const TextStyle(color: AppColors.muted, fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                                Wrap(
                                  spacing: 6,
                                  children: [
                                    _photoChip(l10n.pashuVaultPhotoOwner, a['enrol_photo_owner_url'] != null),
                                    _photoChip(l10n.pashuVaultPhotoTag, a['enrol_photo_tag_url'] != null),
                                  ],
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
            ),

            AppCard(
              title: l10n.pashuVaultPremiumTrail,
              child: ledger.isEmpty
                  ? Text(l10n.pashuVaultNoEntries, style: const TextStyle(color: AppColors.muted))
                  : Column(
                      children: [
                        for (final e in ledger) _ledgerRow(l10n, e as Map),
                      ],
                    ),
            ),

            ElevatedButton(onPressed: _openDoc, child: Text(l10n.pashuVaultViewDoc)),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(onPressed: () => context.push('/pashu-claim'), child: Text(l10n.pashuVaultFileClaim)),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton(onPressed: () => context.push('/pashu-renew'), child: Text(l10n.pashuVaultRenew)),

            const SizedBox(height: AppSpacing.md),
            Text(l10n.pashuVaultFooter, style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.3)),
            const SizedBox(height: AppSpacing.lg),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 14, color: AppColors.ink)),
          Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink)),
        ],
      ),
    );
  }

  Widget _photoChip(String label, bool present) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: present ? AppColors.accent : AppColors.warnAmberBg,
        borderRadius: BorderRadius.circular(AppRadii.chip),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: present ? AppColors.brandDark : AppColors.warnAmber),
      ),
    );
  }

  Widget _ledgerRow(AppLocalizations l10n, Map e) {
    final type = (e['entry_type'] ?? '').toString();
    final label = switch (type) {
      'farmer_debit' => l10n.pashuVaultPlFarmerDebit,
      'subsidy_central' => l10n.pashuVaultPlSubsidyCentral,
      'subsidy_state' => l10n.pashuVaultPlSubsidyState,
      'financed_kcc' => l10n.pashuVaultPlFinancedKcc,
      'refund' => l10n.pashuVaultPlRefund,
      _ => type,
    };
    final status = (e['status'] ?? '').toString();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink)),
                Text(
                  (e['reference'] ?? (e['occurred_at']?.toString().substring(0, 10) ?? '—')).toString(),
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          Text(formatRupees(e['amount']), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
          const SizedBox(width: 8),
          Text(
            status == 'confirmed' ? '✓' : status == 'failed' ? '✕' : '…',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: status == 'confirmed' ? AppColors.brand : status == 'failed' ? AppColors.danger : AppColors.warnAmber,
            ),
          ),
        ],
      ),
    );
  }
}
