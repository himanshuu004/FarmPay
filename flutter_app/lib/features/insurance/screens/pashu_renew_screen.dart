import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/app_card.dart';
import '../../../design_system/widgets/status_chip.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/insurance_providers.dart';

/// Pashu Suraksha renewals — one-tap renew clones the policy + tag + photos
/// (zero re-documentation); opt-in/opt-out auto-renew. Mirrors
/// app/app/pashu-renew.tsx, plus the opt-out control the backend already
/// supports (POST .../opt-out) but RN never exposes.
class PashuRenewScreen extends ConsumerStatefulWidget {
  const PashuRenewScreen({super.key});

  @override
  ConsumerState<PashuRenewScreen> createState() => _PashuRenewScreenState();
}

class _PashuRenewScreenState extends ConsumerState<PashuRenewScreen> {
  bool _loading = true;
  String? _busyKey;
  List<Map> _rows = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(insuranceApiProvider);
      final results = await Future.wait([api.renewalsDue(), api.policiesMe()]);
      final due = results[0];
      final po = results[1];
      final policies = po['success'] == true ? List<Map>.from(po['data']?['policies'] ?? []) : <Map>[];
      final byId = {for (final p in policies) p['id']: p};
      final journeys = due['success'] == true ? List<Map>.from(due['data'] ?? []) : <Map>[];
      setState(() {
        _rows = journeys.map((j) => {...j, 'policy': byId[j['policy_id']]}).toList();
      });
    } catch (_) {
      // offline-tolerant
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showAlert(String title, String msg) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(msg),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(AppLocalizations.of(context).commonOk))],
      ),
    );
  }

  Future<void> _renew(String policyUuid, String key) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busyKey = key);
    try {
      final res = await ref.read(insuranceApiProvider).renew(policyUuid);
      if (res['success'] == true) {
        _showAlert(l10n.pashuRenewRenewed, l10n.pashuRenewRenewedMsg);
        await _load();
      } else {
        _showAlert(l10n.pashuRenewCouldNotRenew, (res['message'] ?? l10n.commonRetry).toString());
      }
    } catch (_) {
      _showAlert(l10n.commonError, l10n.pashuCannotConnect);
    } finally {
      if (mounted) setState(() => _busyKey = null);
    }
  }

  Future<void> _optIn(String journeyUuid) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busyKey = '$journeyUuid-opt');
    try {
      final res = await ref.read(insuranceApiProvider).optInRenewal(journeyUuid);
      if (res['success'] == true) {
        _showAlert(l10n.pashuRenewAutoOnTitle, l10n.pashuRenewAutoOnMsg);
        await _load();
      } else {
        _showAlert(l10n.pashuRenewCouldNotOptin, (res['message'] ?? l10n.commonRetry).toString());
      }
    } catch (_) {
      _showAlert(l10n.commonError, l10n.pashuCannotConnect);
    } finally {
      if (mounted) setState(() => _busyKey = null);
    }
  }

  Future<void> _optOut(String journeyUuid) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busyKey = '$journeyUuid-optout');
    try {
      final res = await ref.read(insuranceApiProvider).optOutRenewal(journeyUuid);
      if (res['success'] == true) {
        _showAlert(l10n.pashuRenewOptOutTitle, l10n.pashuRenewOptOutMsg);
        await _load();
      } else {
        _showAlert(l10n.pashuRenewCouldNotOptout, (res['message'] ?? l10n.commonRetry).toString());
      }
    } catch (_) {
      _showAlert(l10n.commonError, l10n.pashuCannotConnect);
    } finally {
      if (mounted) setState(() => _busyKey = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.pashuActRenew)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_rows.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.pashuActRenew)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(l10n.pashuRenewNoneDue, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(l10n.pashuActRenew)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            for (final r in _rows) _renewalCard(l10n, r),
          ],
        ),
      ),
    );
  }

  Widget _renewalCard(AppLocalizations l10n, Map r) {
    final journeyUuid = r['journey_uuid'].toString();
    final policy = r['policy'] as Map?;
    final autoOn = r['auto_renew_opt_in'] == true;
    final busy = _busyKey != null;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(l10n.pashuRenewDueTitle, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.brandDark)),
              StatusChip(label: (r['status'] ?? '').toString(), tone: StatusTone.warn),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${l10n.pashuRenewDueWord} ${r['due_date']}${policy != null ? ' · ${l10n.pashuSi} ${formatRupees(policy['sum_insured'])}' : ''}',
            style: const TextStyle(color: AppColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 8),
          Text(l10n.pashuRenewNote, style: const TextStyle(color: AppColors.ink, fontSize: 13, height: 1.3)),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: (policy == null || busy) ? null : () => _renew(policy['policy_uuid'].toString(), journeyUuid),
            child: _busyKey == journeyUuid
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(l10n.pashuRenewRenewNow),
          ),
          if (!autoOn)
            TextButton(
              onPressed: busy ? null : () => _optIn(journeyUuid),
              child: Text(l10n.pashuRenewAutoOptin),
            )
          else ...[
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                l10n.pashuRenewAutoIsOn,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.brandDark, fontWeight: FontWeight.w700, fontSize: 13),
              ),
            ),
            TextButton(
              onPressed: busy ? null : () => _optOut(journeyUuid),
              child: Text(l10n.pashuRenewOptOut),
            ),
          ],
        ],
      ),
    );
  }
}
