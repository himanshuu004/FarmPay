import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/step_timeline.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/cia_status.dart';
import '../providers/cia_providers.dart';

/// CIA — application status tracker. One honest timeline from EOI to loan
/// closure, derived from the append-only domain_events outbox. Mirrors
/// app/app/cia-status.tsx. Wired to GET /applications/:uuid/status
/// (auto-picks the farmer's latest application when no `app` param given).
class CiaStatusScreen extends ConsumerStatefulWidget {
  const CiaStatusScreen({super.key, this.appUuid});

  final String? appUuid;

  @override
  ConsumerState<CiaStatusScreen> createState() => _CiaStatusScreenState();
}

class _CiaStatusScreenState extends ConsumerState<CiaStatusScreen> {
  bool _loading = true;
  bool _err = false;
  bool _none = false;
  Map? _status;
  Map? _meta;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _err = false;
      _none = false;
    });
    try {
      final api = ref.read(ciaApiProvider);
      var uuid = widget.appUuid;
      if (uuid == null) {
        final appsRes = await api.myApplications();
        final apps = appsRes['success'] == true ? List<Map>.from(appsRes['data'] ?? []) : <Map>[];
        if (apps.isEmpty) {
          setState(() => _none = true);
          return;
        }
        _meta = apps.first;
        uuid = apps.first['applicationUuid'].toString();
      }
      final res = await api.getStatus(uuid);
      if (res['success'] == true) {
        setState(() => _status = Map.from(res['data']));
      } else {
        setState(() => _err = true);
      }
    } catch (_) {
      setState(() => _err = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavStatus)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _none
          ? _noneView(l10n)
          : _err || _status == null
          ? _errorView(l10n)
          : _body(l10n, _status!),
    );
  }

  Widget _noneView(AppLocalizations l10n) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('🐄', style: TextStyle(fontSize: 48)),
        const SizedBox(height: 8),
        Text(l10n.ciaStNone, style: const TextStyle(color: AppColors.muted)),
        const SizedBox(height: 16),
        ElevatedButton(onPressed: () => context.pushReplacement('/cia-schemes'), child: Text(l10n.ciaStBrowse)),
      ],
    ),
  );

  Widget _errorView(AppLocalizations l10n) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(l10n.ciaLoadError, style: const TextStyle(color: AppColors.muted)),
        const SizedBox(height: 12),
        ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
      ],
    ),
  );

  Widget _body(AppLocalizations l10n, Map st) {
    final status = st['status'].toString();
    final declined = kCiaDeclined[status];
    final fillable = kCiaFillableStatuses.contains(status);
    final returned = status == 'RETURNED_FOR_CORRECTION' || status == 'DOCUMENTS_INCOMPLETE';
    final purchasing = st['purchaseUnlocked'] == true || status == 'PURCHASE_INITIATED';
    final inRepayment = kCiaInRepaymentStatuses.contains(status);
    final curIdx = declined != null ? declined.at : ciaStepIndexOf(status);
    final curLabel = curIdx >= 0 ? ciaStepLabel(l10n, kCiaStatusSteps[curIdx].key) : status;
    final fin = st['financials'] ?? st['subsidyTransfer'] ?? st['disbursement'];

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(color: AppColors.blueBg, borderRadius: BorderRadius.circular(10)),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  '${l10n.ciaStAsOf} ${_asOfLabel(st['asOf'])}',
                  style: const TextStyle(color: AppColors.blue, fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
              ),
              if (_meta?['dcsRef'] != null)
                Text(
                  _meta!['dcsRef'].toString(),
                  style: const TextStyle(color: AppColors.blue, fontSize: 12, fontWeight: FontWeight.w800),
                ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: declined != null ? const Color(0xFFFDF3F2) : AppColors.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: declined != null ? const Color(0xFFF1C7C1) : AppColors.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.ciaStCurrent.toUpperCase(),
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 0.5),
              ),
              const SizedBox(height: 2),
              Text(
                curLabel,
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: declined != null ? AppColors.danger : AppColors.brandDark),
              ),
              if (st['nextStep'] != null) ...[
                const SizedBox(height: 4),
                Text('${l10n.ciaStNext}: ${st['nextStep']}', style: const TextStyle(fontSize: 13.5, color: AppColors.muted, height: 1.3)),
              ],
              if (fillable)
                _cta(returned ? l10n.ciaStFix : l10n.ciaStComplete, () => context.push('/cia-application'))
              else if (purchasing)
                _cta(l10n.ciaPurBuyHero, () => context.push('/cia-purchase'))
              else if (inRepayment)
                _cta(l10n.ciaNavEmi, () => context.push('/cia-emi')),
              if (declined != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: AppColors.dangerBg, borderRadius: BorderRadius.circular(8)),
                  child: Text(
                    declined.key == 'not_selected' ? l10n.ciaStNotSelected : l10n.ciaStRejected,
                    style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w700),
                  ),
                ),
              ] else if (returned && st['returnedFor'] != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(8)),
                  child: Text(
                    '↩ ${l10n.ciaStReturned} — "${st['returnedFor']['reason']}"',
                    style: const TextStyle(color: AppColors.warnAmber, fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (fin != null)
          InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => context.push('/cia-loan'),
            child: Container(
              padding: const EdgeInsets.all(14),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        l10n.ciaStFinancials.toUpperCase(),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 0.5),
                      ),
                      Text('${l10n.ciaLoanDetails} →', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.brandDark)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (st['subsidyTransfer'] != null)
                    _finRow(l10n.ciaStSubsidy, formatRupees(st['subsidyTransfer']['amount'])),
                  if (st['disbursement'] != null) ...[
                    _finRow(l10n.ciaStLoan, formatRupees(st['disbursement']['amount'])),
                    _finRow(l10n.ciaStLoanAc, st['disbursement']['loanAccount'].toString()),
                  ],
                ],
              ),
            ),
          ),
        StepTimeline(steps: buildCiaStatusTimeline(l10n, status)),
      ],
    );
  }

  Widget _cta(String label, VoidCallback onTap) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: SizedBox(
      width: double.infinity,
      child: ElevatedButton(onPressed: onTap, child: Text('$label →')),
    ),
  );

  Widget _finRow(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 13.5, color: AppColors.muted)),
        Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.ink)),
      ],
    ),
  );

  String _asOfLabel(dynamic iso) {
    if (iso == null) return '—';
    final d = DateTime.tryParse(iso.toString());
    if (d == null) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final h = d.hour;
    final mm = d.minute.toString().padLeft(2, '0');
    final ap = h < 12 ? 'AM' : 'PM';
    final h12 = h % 12 == 0 ? 12 : h % 12;
    return '${d.day} ${months[d.month - 1]}, $h12:$mm $ap';
  }
}
