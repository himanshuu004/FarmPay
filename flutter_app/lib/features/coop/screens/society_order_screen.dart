import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_response.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/quantity_stepper.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/coop_providers.dart';

/// Input catalog → cart → submit. Mirrors app/app/society-order.tsx. The app
/// authors only the DRAFT→SUBMIT transition; the demand window (1st/3rd
/// week) and the 70% limit are both enforced server-side — this screen only
/// warns, never blocks locally beyond what the server already rejects.
class SocietyOrderScreen extends ConsumerStatefulWidget {
  const SocietyOrderScreen({super.key});

  @override
  ConsumerState<SocietyOrderScreen> createState() => _SocietyOrderScreenState();
}

class _SocietyOrderScreenState extends ConsumerState<SocietyOrderScreen> {
  bool _loading = true;
  bool _submitting = false;
  List<Map> _items = [];
  double _limit = 0;
  final Map<String, int> _cart = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(coopApiProvider);
      final results = await Future.wait([api.getCatalog(), api.getPassbook()]);
      final cat = results[0];
      final pb = results[1];
      if (cat['success'] == true) {
        setState(() => _items = List<Map>.from(cat['data'] ?? []));
      }
      if (pb['success'] == true && pb['data']?['isMember'] != false) {
        setState(
          () => _limit =
              (pb['data']?['availableOrderLimit'] as num?)?.toDouble() ?? 0,
        );
      }
    } catch (_) {
      // offline-tolerant: keep whatever was already loaded
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _setQty(String sku, int q) {
    setState(() => _cart[sku] = q < 0 ? 0 : q);
  }

  double get _total {
    var total = 0.0;
    for (final it in _items) {
      final qty = _cart[it['sku']] ?? 0;
      total += qty * (it['subsidisedPrice'] as num).toDouble();
    }
    return total;
  }

  bool get _overLimit => _total > _limit;

  void _showSnack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : null,
      ),
    );
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final lines = _cart.entries
        .where((e) => e.value > 0)
        .map((e) => {'sku': e.key, 'quantity': e.value})
        .toList();
    if (lines.isEmpty) {
      _showSnack(l10n.socEmptyCartMsg, error: true);
      return;
    }
    setState(() => _submitting = true);
    try {
      final api = ref.read(coopApiProvider);
      final draft = await api.createDraft(lines);
      if (draft['success'] != true) {
        _showSnack(
          apiErrorMessage(draft, fallback: l10n.socOrderCreateFail),
          error: true,
        );
        return;
      }
      final orderUuid = draft['data']['orderUuid'];
      final sub = await api.submitOrder(orderUuid);
      if (sub['success'] == true) {
        _showSnack(l10n.socOrderSubmittedMsg);
        setState(() => _cart.clear());
        if (mounted) context.pushReplacement('/society-orders');
      } else {
        _showSnack(
          apiErrorMessage(sub, fallback: l10n.socNotSubmittedMsg),
          error: true,
        );
      }
    } catch (_) {
      _showSnack(l10n.socConnectSocietyFail, error: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.socOrderInputs)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.socOrderInputs)),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            color: AppColors.accent,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.md,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.socAvailableCredit,
                  style: const TextStyle(
                    color: AppColors.brandDark,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  formatRupees(_limit),
                  style: const TextStyle(
                    color: AppColors.brandDark,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.lg,
                160,
              ),
              children: [
                AppCard(
                  title: l10n.socChooseItems,
                  child: _items.isEmpty
                      ? Text(
                          l10n.socNoItems,
                          style: const TextStyle(color: AppColors.muted),
                        )
                      : Column(
                          children: [
                            for (final it in _items)
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: AppSpacing.sm,
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            it['name'].toString(),
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            '${formatRupees(it['subsidisedPrice'] as num)} ${l10n.socPerUnit} ${it['unit']}',
                                            style: const TextStyle(
                                              color: AppColors.muted,
                                              fontSize: 12,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    QuantityStepper(
                                      value: _cart[it['sku']] ?? 0,
                                      onChanged: (q) => _setQty(it['sku'], q),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomSheet: Container(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.md,
          AppSpacing.lg,
          AppSpacing.lg,
        ),
        decoration: const BoxDecoration(
          color: AppColors.card,
          border: Border(top: BorderSide(color: AppColors.line)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.socTotal,
                  style: const TextStyle(
                    color: AppColors.muted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  formatRupees(_total),
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: _overLimit ? AppColors.danger : AppColors.brandDark,
                  ),
                ),
              ],
            ),
            if (_overLimit) ...[
              const SizedBox(height: 4),
              Text(
                l10n.socOverLimitWarn,
                style: const TextStyle(color: AppColors.danger, fontSize: 12),
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            ElevatedButton(
              onPressed: (_submitting || _overLimit) ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(l10n.socSubmitOrder),
            ),
          ],
        ),
      ),
    );
  }
}
