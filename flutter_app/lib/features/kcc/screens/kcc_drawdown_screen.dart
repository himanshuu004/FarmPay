import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/status_chip.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/kcc_status.dart';
import '../providers/kcc_providers.dart';

const _items = ['ANIMAL', 'SHED', 'EQUIPMENT'];

/// KCC LT drawdown (¶19(2)) — draw against the investment sub-limit for an
/// animal, shed, or equipment. Mirrors app/app/kcc-drawdown.tsx: create then
/// immediately submit (the RN reference never leaves a request in DRAFT for
/// the farmer). On disbursement the asset auto-enters the register and an
/// insurance nudge fires — server-side, this screen only submits + lists.
class KccDrawdownScreen extends ConsumerStatefulWidget {
  const KccDrawdownScreen({super.key});

  @override
  ConsumerState<KccDrawdownScreen> createState() => _KccDrawdownScreenState();
}

class _KccDrawdownScreenState extends ConsumerState<KccDrawdownScreen> {
  bool _loading = true;
  bool _busy = false;
  String? _facilityUuid;
  Map? _headroom;
  List<Map> _requests = [];
  String _item = 'ANIMAL';
  final _descCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _descCtrl.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final fac = await ref.read(kccApiProvider).getFacility();
      if (fac['success'] != true || fac['data']?['hasFacility'] != true) {
        setState(() => _facilityUuid = null);
        return;
      }
      final fu = fac['data']['facilityUuid'].toString();
      final dd = await ref.read(kccApiProvider).listDrawdowns(fu);
      setState(() {
        _facilityUuid = fu;
        if (dd['success'] == true) {
          _headroom = dd['data']?['headroom'];
          _requests = List<Map>.from(dd['data']?['requests'] ?? []);
        }
      });
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showSnack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? AppColors.danger : null),
    );
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final amt = num.tryParse(_amountCtrl.text.trim());
    if (_descCtrl.text.trim().isEmpty || amt == null || amt <= 0) {
      _showSnack('${l10n.kccFillItIn}. ${l10n.kccFillDescAmount}', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final api = ref.read(kccApiProvider);
      final create = await api.createDrawdown(
        _facilityUuid!,
        item: _item,
        description: _descCtrl.text.trim(),
        amount: amt,
      );
      if (create['success'] != true) {
        _showSnack(
          '${l10n.kccCouldNotRaise}. ${(create['message'] ?? l10n.commonRetry).toString()}',
          error: true,
        );
        return;
      }
      final sub = await api.submitDrawdown(create['data']['requestUuid'].toString());
      if (sub['success'] == true) {
        _showSnack('${l10n.kccSubmittedTitle}. ${l10n.kccSentToBank}');
        _descCtrl.clear();
        _amountCtrl.clear();
        await _load();
      } else {
        _showSnack(
          '${l10n.kccNotSubmitted}. ${(sub['message'] ?? l10n.commonRetry).toString()}',
          error: true,
        );
      }
    } catch (_) {
      _showSnack(l10n.kccCannotConnect, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final itemLabel = {
      'ANIMAL': l10n.kccItemAnimal,
      'SHED': l10n.kccItemShed,
      'EQUIPMENT': l10n.kccItemEquipment,
    };

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccInvestmentHeadroom)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_facilityUuid == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.kccInvestmentHeadroom)),
        body: Center(child: Text(l10n.kccApplyFirst, style: const TextStyle(color: AppColors.muted))),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.kccInvestmentHeadroom)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppCard(
            title: l10n.kccInvestmentHeadroom,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  formatRupees(_headroom?['available'] ?? 0),
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.brandDark),
                ),
                const SizedBox(height: 2),
                Text(
                  '${l10n.kccOfWord} ${formatRupees(_headroom?['ceiling'] ?? 0)} · ${l10n.kccCommittedWord} ${formatRupees(_headroom?['committed'] ?? 0)}',
                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                ),
              ],
            ),
          ),

          AppCard(
            title: l10n.kccNewDrawdown,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    for (final it in _items)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(10),
                            onTap: () => setState(() => _item = it),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                color: _item == it ? AppColors.accent : Colors.transparent,
                                border: Border.all(color: _item == it ? AppColors.brand : AppColors.line),
                              ),
                              child: Text(
                                itemLabel[it]!,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: _item == it ? FontWeight.w700 : FontWeight.w400,
                                  color: _item == it ? AppColors.brandDark : AppColors.muted,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _descCtrl,
                  decoration: InputDecoration(hintText: l10n.kccDescPlaceholder),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _amountCtrl,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(hintText: l10n.kccAmountPlaceholder),
                ),
                const SizedBox(height: 10),
                Text(l10n.kccDrawdownNote, style: const TextStyle(fontSize: 12, color: AppColors.muted, height: 1.35)),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(l10n.kccSubmitDrawdown),
                ),
              ],
            ),
          ),

          if (_requests.isNotEmpty)
            AppCard(
              title: l10n.kccYourDrawdowns,
              child: Column(
                children: [
                  for (final r in _requests)
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
                                Text(
                                  formatRupees(r['amount']),
                                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                                ),
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
