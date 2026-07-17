import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/limit_meter.dart';
import '../../../design_system/widgets/main_app_bar.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/insurance_providers.dart';

/// Pashu Suraksha home — the protection snapshot ("N of M covered"),
/// active policies, and the paths to quote/enrol/claim/renew. Mirrors
/// app/app/pashu-home.tsx, plus a renewal-due hero banner the prototype
/// specifies (prototypes/insurance/index.html) that RN never wired.
class PashuHomeScreen extends ConsumerStatefulWidget {
  const PashuHomeScreen({super.key});

  @override
  ConsumerState<PashuHomeScreen> createState() => _PashuHomeScreenState();
}

class _PashuHomeScreenState extends ConsumerState<PashuHomeScreen> {
  bool _loading = true;
  Map? _data;
  int? _renewHeroDays;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(insuranceApiProvider);
      final results = await Future.wait([
        api.policiesMe(),
        api.renewalsDue().catchError((_) => {'success': false}),
      ]);
      final pol = results[0];
      final due = results[1];
      if (pol['success'] == true) setState(() => _data = pol['data']);
      if (due['success'] == true) {
        final journeys = List<Map>.from(due['data'] ?? []);
        DateTime? soonest;
        for (final j in journeys) {
          final d = DateTime.tryParse((j['due_date'] ?? '').toString());
          if (d != null && (soonest == null || d.isBefore(soonest))) soonest = d;
        }
        if (soonest != null) {
          final days = soonest.difference(DateTime.now()).inDays;
          setState(() => _renewHeroDays = days < 0 ? 0 : days);
        }
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
        appBar: MainAppBar(title: l10n.tabSuraksha),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final snap = _data?['snapshot'] as Map?;
    final total = asNum(snap?['animalsTotal']).toInt();
    final covered = asNum(snap?['animalsCovered']).toInt();
    final fill = total == 0 ? 0.0 : covered / total;
    final policies = (_data?['policies'] as List?) ?? const [];

    return Scaffold(
      appBar: MainAppBar(title: l10n.tabSuraksha),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            if (_renewHeroDays != null)
              InkWell(
                borderRadius: BorderRadius.circular(AppRadii.button),
                onTap: () => context.push('/pashu-renew'),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppSpacing.md),
                  margin: const EdgeInsets.only(bottom: AppSpacing.md),
                  decoration: BoxDecoration(
                    color: AppColors.warnAmberBg,
                    borderRadius: BorderRadius.circular(AppRadii.button),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          l10n.pashuHomeRenewHeroDays(_renewHeroDays!),
                          style: const TextStyle(color: AppColors.warnAmber, fontSize: 13, fontWeight: FontWeight.w600, height: 1.3),
                        ),
                      ),
                      Text(
                        l10n.pashuHomeRenewCta,
                        style: const TextStyle(color: AppColors.warnAmber, fontWeight: FontWeight.w800, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ),

            AppCard(
              title: l10n.pashuHomeMyProtection,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        (snap?['label'] as String?) ?? l10n.pashuHomeCoveredDefault,
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(AppRadii.chip)),
                        child: const Text('NLM', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.brandDark)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  LimitMeter(fraction: fill),
                  const SizedBox(height: 6),
                  Text(
                    '${l10n.pashuHomeSiActive}: ${formatRupees(snap?['sumInsuredTotal'] ?? 0)} · ${(total - covered).clamp(0, total)} ${l10n.pashuHomeUncovered}',
                    style: const TextStyle(color: AppColors.muted, fontSize: 13),
                  ),
                ],
              ),
            ),

            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.6,
              children: [
                _action('🐄', l10n.pashuActAnimals, () => context.push('/pashu-animals')),
                _action('🧮', l10n.pashuActQuote, () => context.push('/pashu-quote')),
                _action('🏷️', l10n.pashuActEnrol, () => context.push('/pashu-enrol')),
                _action('📋', l10n.pashuActClaim, () => context.push('/pashu-claim')),
                _action('🔄', l10n.pashuActRenew, () => context.push('/pashu-renew')),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),

            AppCard(
              title: l10n.pashuHomePolicies,
              child: policies.isEmpty
                  ? Text(l10n.pashuHomeNoPolicies, style: const TextStyle(color: AppColors.muted))
                  : Column(
                      children: [
                        for (final p in policies)
                          InkWell(
                            onTap: () => context.push('/pashu-vault?policyUuid=${p['policy_uuid']}'),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: const BoxDecoration(
                                border: Border(bottom: BorderSide(color: AppColors.line)),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '${l10n.pashuHomePolicy} · ${l10n.pashuSi} ${formatRupees(p['sum_insured'])}',
                                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink),
                                        ),
                                        Text(
                                          '${l10n.pashuHomeYouPay} ${formatRupees(p['premium_farmer'])} · ${l10n.pashuHomeEnds} ${p['end_date'] ?? '—'}',
                                          style: const TextStyle(color: AppColors.muted, fontSize: 12),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: p['status'] == 'active' ? AppColors.accent : AppColors.line,
                                      borderRadius: BorderRadius.circular(AppRadii.chip),
                                    ),
                                    child: Text(
                                      (p['status'] ?? '').toString(),
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        color: p['status'] == 'active' ? AppColors.brandDark : AppColors.muted,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
            ),

            Text(
              l10n.pashuHomeFooterMuzzle,
              style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.3),
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
        ),
      ),
    );
  }

  Widget _action(String icon, String label, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.line),
        ),
        alignment: Alignment.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(icon, style: const TextStyle(fontSize: 26)),
            const SizedBox(height: 6),
            Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.brandDark), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
