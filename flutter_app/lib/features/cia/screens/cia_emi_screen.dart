import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/status_chip.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/cia_status.dart' show ciaEmiStatusTone, ciaShortDate;
import '../providers/cia_providers.dart';

/// CIA — milk-payment EMI ledger. The honest recovery view: each
/// instalment's EMI due vs what was actually deducted and remitted
/// (reconciled from the ERP settlement file). Mirrors app/app/cia-emi.tsx.
///
/// Also folds in PRD screen #20 (default alert) as an overdue banner — RN
/// never built a dedicated screen for it and no prototype exists for one,
/// so rather than invent an unspecified extra screen, the same
/// OVERDUE/DEFAULT signal this ledger already carries surfaces as a
/// plain-language warning + a link to raise a grievance.
class CiaEmiScreen extends ConsumerStatefulWidget {
  const CiaEmiScreen({super.key, this.appUuid});

  final String? appUuid;

  @override
  ConsumerState<CiaEmiScreen> createState() => _CiaEmiScreenState();
}

class _CiaEmiScreenState extends ConsumerState<CiaEmiScreen> {
  bool _loading = true;
  bool _err = false;
  String? _uuid;
  Map? _emi;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _err = false;
    });
    try {
      final api = ref.read(ciaApiProvider);
      var uuid = widget.appUuid;
      if (uuid == null) {
        final appsRes = await api.myApplications();
        final apps = appsRes['success'] == true ? List<Map>.from(appsRes['data'] ?? []) : <Map>[];
        if (apps.isEmpty) {
          setState(() => _err = true);
          return;
        }
        uuid = apps.first['applicationUuid'].toString();
      }
      _uuid = uuid;
      final res = await api.getEmi(uuid);
      if (res['success'] == true) {
        setState(() => _emi = Map.from(res['data']));
      } else {
        setState(() => _err = true);
      }
    } catch (_) {
      setState(() => _err = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _viewNoDues() async {
    final uuid = _uuid;
    if (uuid == null) return;
    final l10n = AppLocalizations.of(context);
    final res = await ref.read(ciaApiProvider).getNoDues(uuid);
    if (!mounted) return;
    if (res['success'] != true) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.ciaLoadError)));
      return;
    }
    final c = Map.from(res['data']);
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text((c['certificateNo'] ?? l10n.ciaEmiNoDues).toString()),
        content: Text('${c['statement'] ?? ''}\n${l10n.ciaEmiLoanAc} ${c['loanAccount'] ?? ''}\n${l10n.ciaEmiOutstanding}: ${formatRupees(0)}'),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.commonCancel))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavEmi)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _err || _emi == null
          ? _errorView(l10n)
          : _body(l10n, _emi!),
    );
  }

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

  Widget _body(AppLocalizations l10n, Map emi) {
    final initiate = emi['mode'] == 'INITIATE';
    final ledger = List<Map>.from(emi['ledger'] ?? []);
    final schedule = List<Map>.from(emi['schedule'] ?? []);
    final hasLedger = ledger.isNotEmpty;
    final outstanding = (emi['outstanding'] as num?) ?? 0;
    final closed = (emi['installments'] as num? ?? 0) > 0 && outstanding <= 0 && hasLedger;
    final hasOverdue = ledger.any((r) => r['status'] == 'OVERDUE' || r['status'] == 'DEFAULT');

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(color: AppColors.blueBg, borderRadius: BorderRadius.circular(10)),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(child: Text(l10n.ciaEmiAsOf, style: const TextStyle(color: AppColors.blue, fontSize: 12, fontWeight: FontWeight.w600))),
              if (emi['loanAccount'] != null)
                Text('${l10n.ciaEmiLoanAc} ${emi['loanAccount']}', style: const TextStyle(color: AppColors.blue, fontSize: 11.5, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        if (hasOverdue) ...[
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(color: AppColors.dangerBg, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF6CFC9))),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('⚠ ${l10n.ciaEmiOverdueTitle}', style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w800, fontSize: 14)),
                const SizedBox(height: 4),
                Text(l10n.ciaEmiOverdueBody, style: const TextStyle(color: AppColors.danger, fontSize: 12.5, height: 1.4)),
                const SizedBox(height: 8),
                TextButton(
                  style: TextButton.styleFrom(padding: EdgeInsets.zero, alignment: Alignment.centerLeft),
                  onPressed: () => context.push('/cia-grievance${_uuid != null ? '?app=$_uuid' : ''}'),
                  child: Text('${l10n.ciaEmiGetHelp} →', style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
        ],
        Container(
          padding: const EdgeInsets.all(11),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: initiate ? const Color(0xFFE9F8EF) : AppColors.warnAmberBg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: initiate ? const Color(0xFFBFE3CF) : const Color(0xFFF3E2C8)),
          ),
          child: Text(
            '${initiate ? '✓ ' : '🔒 '}${initiate ? l10n.ciaEmiModeInitiate : l10n.ciaEmiModeTrack}',
            style: TextStyle(fontSize: 12.5, color: initiate ? AppColors.brandDark : AppColors.warnAmber, fontWeight: initiate ? FontWeight.w600 : FontWeight.normal, height: 1.3),
          ),
        ),
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.line)),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(formatRupees(outstanding), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.brandDark)),
                  Text(l10n.ciaEmiOutstanding, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ],
              ),
              if (emi['nextEmi'] != null)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(l10n.ciaEmiNext, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                    Text(formatRupees(emi['nextEmi']['amount']), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.ink)),
                  ],
                ),
            ],
          ),
        ),
        if (emi['moratoriumUntil'] != null)
          Container(
            padding: const EdgeInsets.all(8),
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(8)),
            child: Text(
              '${l10n.ciaEmiMoratorium} ${ciaShortDate(emi['moratoriumUntil'].toString())}',
              style: const TextStyle(color: AppColors.warnAmber, fontSize: 12),
            ),
          ),
        if (hasLedger)
          for (final r in ledger) _ledgerRow(l10n, r)
        else if (schedule.isNotEmpty)
          for (final s in schedule) _scheduleRow(l10n, s)
        else
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.line)),
            child: Text(l10n.ciaEmiNoSchedule, style: const TextStyle(color: AppColors.muted)),
          ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: initiate
              ? OutlinedButton(
                  onPressed: () => context.push('/cia-emi-consent${_uuid != null ? '?app=$_uuid' : ''}'),
                  child: Text('${l10n.ciaEmiManageConsent} →'),
                )
              : ElevatedButton(
                  onPressed: () => context.push('/cia-emi-consent${_uuid != null ? '?app=$_uuid' : ''}'),
                  child: Text('${l10n.ciaEmiSetupConsent} →'),
                ),
        ),
        Center(
          child: TextButton(
            onPressed: () => context.push('/cia-claim${_uuid != null ? '?app=$_uuid' : ''}'),
            child: Text('🛡 ${l10n.ciaNavClaim} →'),
          ),
        ),
        if (closed)
          Center(
            child: TextButton(
              onPressed: _viewNoDues,
              child: Text('✅ ${l10n.ciaEmiNoDues}'),
            ),
          ),
      ],
    );
  }

  Widget _ledgerRow(AppLocalizations l10n, Map r) {
    final status = r['status'].toString();
    final detail = status == 'PAID'
        ? '${l10n.ciaEmiDeducted} ${formatRupees(r['amountDeducted'])}'
        : status == 'PARTIAL'
        ? '${l10n.ciaEmiDeducted} ${formatRupees(r['amountDeducted'])} · ${l10n.ciaEmiPending} ${formatRupees(r['pending'])}'
        : (status == 'OVERDUE' || status == 'DEFAULT')
        ? '${l10n.ciaEmiNothing} · ${formatRupees(r['pending'])} ${l10n.ciaEmiOverdueAmt}'
        : '${l10n.ciaEmiDue} ${formatRupees(r['emiDue'])}';
    return _row(l10n, r['installmentNo'], detail, status, _emiStatusLabel(l10n, status));
  }

  Widget _scheduleRow(AppLocalizations l10n, Map s) {
    final status = s['status']?.toString() ?? 'SCHEDULED';
    final detail = '${l10n.ciaEmiDue} ${formatRupees(s['emiDue'])}${s['dueDate'] != null ? ' · ${ciaShortDate(s['dueDate'].toString())}' : ''}';
    return _row(l10n, s['installmentNo'], detail, status, _emiStatusLabel(l10n, status));
  }

  Widget _row(AppLocalizations l10n, dynamic no, String detail, String status, String statusLabel) => Container(
    padding: const EdgeInsets.all(11),
    margin: const EdgeInsets.only(bottom: 7),
    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(11), border: Border.all(color: AppColors.line)),
    child: Row(
      children: [
        SizedBox(width: 82, child: Text('${l10n.ciaEmiInst} $no', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.ink))),
        Expanded(child: Text(detail, style: const TextStyle(fontSize: 12.5, color: AppColors.muted), overflow: TextOverflow.ellipsis)),
        StatusChip(label: statusLabel, tone: ciaEmiStatusTone(status)),
      ],
    ),
  );

  String _emiStatusLabel(AppLocalizations l10n, String status) {
    switch (status) {
      case 'PAID':
        return l10n.ciaEmiStPaid;
      case 'PARTIAL':
        return l10n.ciaEmiStPartial;
      case 'OVERDUE':
        return l10n.ciaEmiStOverdue;
      case 'DEFAULT':
        return l10n.ciaEmiStDefault;
      case 'DUE':
        return l10n.ciaEmiStDue;
      case 'SCHEDULED':
      default:
        return l10n.ciaEmiStScheduled;
    }
  }
}
