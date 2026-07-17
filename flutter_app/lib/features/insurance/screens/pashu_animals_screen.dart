import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/insurance_providers.dart';

const _speciesIcon = {
  'CATTLE': '🐄',
  'BUFFALO': '🐃',
  'GOAT': '🐐',
  'SHEEP': '🐑',
  'PIG': '🐖',
};

/// Pashu Suraksha — animal registry. The herd from the dairy register with
/// a covered/uninsured badge per animal. Mirrors app/app/pashu-animals.tsx.
class PashuAnimalsScreen extends ConsumerStatefulWidget {
  const PashuAnimalsScreen({super.key});

  @override
  ConsumerState<PashuAnimalsScreen> createState() => _PashuAnimalsScreenState();
}

class _PashuAnimalsScreenState extends ConsumerState<PashuAnimalsScreen> {
  bool _loading = true;
  List<Map> _animals = [];
  Map? _snap;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(insuranceApiProvider);
      final results = await Future.wait([api.assetsMe(), api.policiesMe()]);
      final assetsRes = results[0];
      final pol = results[1];
      setState(() {
        if (assetsRes['success'] == true) {
          _animals = List<Map>.from(assetsRes['data'] ?? []);
        }
        if (pol['success'] == true) _snap = pol['data']?['snapshot'];
      });
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
        appBar: AppBar(title: Text(l10n.pashuAnimalsMyHerd)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final covered = _animals.where((a) => a['covered'] == true).toList();
    final uninsured = _animals.where((a) => a['covered'] != true).toList();

    return Scaffold(
      appBar: AppBar(title: Text(l10n.pashuAnimalsMyHerd)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppCard(
            title: l10n.pashuAnimalsMyHerd,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      (_snap?['label'] as String?) ??
                          '${covered.length} ${l10n.pashuOf} ${_animals.length} ${l10n.pashuCoveredLc}',
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(AppRadii.chip)),
                      child: const Text('NLM', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.brandDark)),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '${uninsured.length} ${l10n.pashuAnimalsUninsuredSuffix}',
                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                ),
              ],
            ),
          ),

          if (_animals.isEmpty)
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l10n.pashuAnimalsEmpty, style: const TextStyle(color: AppColors.muted)),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () => context.push('/dairy-animals'),
                    child: Text('🐄 ${l10n.pashuAnimalsGoToAnimals}'),
                  ),
                ],
              ),
            ),

          if (uninsured.isNotEmpty)
            AppCard(
              title: l10n.pashuUninsured,
              child: Column(
                children: [
                  for (final a in uninsured)
                    InkWell(
                      onTap: () => context.push('/pashu-quote?animalId=${a['animalId']}'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.line))),
                        child: Row(
                          children: [
                            Text(_speciesIcon[a['species']] ?? '🐾', style: const TextStyle(fontSize: 24)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    (a['tagNumber'] as String?) ?? l10n.pashuUntagged,
                                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                                  ),
                                  Text(
                                    (a['species'] as String?) ?? l10n.pashuAnimalWord,
                                    style: const TextStyle(color: AppColors.muted, fontSize: 13),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              l10n.pashuAnimalsInsureCta,
                              style: const TextStyle(color: AppColors.warnAmber, fontSize: 14, fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),

          if (covered.isNotEmpty)
            AppCard(
              title: l10n.pashuInsured,
              child: Column(
                children: [
                  for (final a in covered)
                    InkWell(
                      onTap: a['coverPolicyUuid'] != null
                          ? () => context.push('/pashu-vault?policyUuid=${a['coverPolicyUuid']}')
                          : null,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.line))),
                        child: Row(
                          children: [
                            Text(_speciesIcon[a['species']] ?? '🐾', style: const TextStyle(fontSize: 24)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    (a['tagNumber'] as String?) ?? l10n.pashuUntagged,
                                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                                  ),
                                  Text(
                                    '${(a['species'] as String?) ?? l10n.pashuAnimalWord}${a['coverTagUid'] != null ? ' · UID ${a['coverTagUid']}' : ''}',
                                    style: const TextStyle(color: AppColors.muted, fontSize: 13),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                              decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(AppRadii.chip)),
                              child: Text(
                                l10n.pashuCoveredBadge,
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),

          Text(l10n.pashuAnimalsFooterTag, style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.3)),
          const SizedBox(height: AppSpacing.lg),
        ],
      ),
    );
  }
}
