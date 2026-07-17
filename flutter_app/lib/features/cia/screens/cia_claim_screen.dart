import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../models/cia_status.dart' show kCiaClaimStages, ciaClaimStageLabel, ciaClaimStageOf;
import '../providers/cia_providers.dart';

/// CIA — cattle insurance claim (report + track). Reuses the platform
/// CLAIMS engine: only 4 documents, a 15-day settlement clock, 12% p.a.
/// penal interest on breach, no auto-denial. Mirrors app/app/cia-claim.tsx.
class CiaClaimScreen extends ConsumerStatefulWidget {
  const CiaClaimScreen({super.key, this.appUuid});

  final String? appUuid;

  @override
  ConsumerState<CiaClaimScreen> createState() => _CiaClaimScreenState();
}

class _CiaClaimScreenState extends ConsumerState<CiaClaimScreen> {
  bool _loading = true;
  bool _unavailable = false;
  String? _uuid;
  Map? _data;
  final _perilCtrl = TextEditingController();
  final _sumCtrl = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _perilCtrl.dispose();
    _sumCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _unavailable = false;
    });
    try {
      final api = ref.read(ciaApiProvider);
      var uuid = widget.appUuid;
      if (uuid == null) {
        final appsRes = await api.myApplications();
        final apps = appsRes['success'] == true ? List<Map>.from(appsRes['data'] ?? []) : <Map>[];
        if (apps.isEmpty) {
          setState(() => _unavailable = true);
          return;
        }
        uuid = apps.first['applicationUuid'].toString();
      }
      _uuid = uuid;
      final res = await api.getClaim(uuid);
      if (res['success'] == true && res['data'] != null) {
        setState(() => _data = Map.from(res['data']));
      } else {
        setState(() => _unavailable = true);
      }
    } catch (_) {
      setState(() => _unavailable = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _file() async {
    final uuid = _uuid;
    if (uuid == null) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final peril = _perilCtrl.text.trim();
      final sumStr = _sumCtrl.text.replaceAll(RegExp(r'[^\d]'), '');
      final sum = num.tryParse(sumStr);
      final res = await ref.read(ciaApiProvider).reportClaim(
        uuid,
        deathDate: today,
        peril: peril.isEmpty ? null : peril,
        sumClaimed: (sum != null && sum > 0) ? sum : null,
      );
      if (res['success'] == true) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.ciaClaimFiled)));
        await _load();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text((res['message'] ?? l10n.ciaLoadError).toString()), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavClaim)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _unavailable
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('🐄', style: TextStyle(fontSize: 46)),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: Text(l10n.ciaClaimUnavailable, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
                  ),
                ],
              ),
            )
          : (_data?['claimUuid'] == null ? _reportForm(l10n) : _trackView(l10n, _data!)),
    );
  }

  Widget _reportForm(AppLocalizations l10n) => ListView(
    padding: const EdgeInsets.all(AppSpacing.lg),
    children: [
      Text(l10n.ciaClaimReportTitle, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink)),
      const SizedBox(height: 6),
      Text(l10n.ciaClaimReportSub, style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.35)),
      const SizedBox(height: 16),
      Text(l10n.ciaClaimPeril, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      TextField(controller: _perilCtrl, decoration: InputDecoration(hintText: l10n.ciaClaimPerilPh)),
      const SizedBox(height: 12),
      Text(l10n.ciaClaimSum, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      TextField(controller: _sumCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(prefixText: '₹ ')),
      const SizedBox(height: 18),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: _busy ? null : _file,
          child: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text(l10n.ciaClaimSubmit),
        ),
      ),
      const SizedBox(height: 12),
      Text('ℹ ${l10n.ciaClaimNoDenial}', textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
    ],
  );

  Widget _trackView(AppLocalizations l10n, Map data) {
    final deadline = data['settlementDeadlineAt'];
    int? days;
    if (deadline != null) {
      final d = DateTime.tryParse(deadline.toString());
      if (d != null) days = d.difference(DateTime.now()).inHours ~/ 24;
    }
    final settled = data['status'] == 'SETTLED';
    final breach = !settled && days != null && days < 0;
    final penal = (data['penalInterestAccrued'] as num?) ?? 0;
    final stage = ciaClaimStageOf((data['status'] ?? 'INTIMATED').toString());
    final docs = List<Map>.from(data['docChecklist'] ?? []);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: breach ? AppColors.dangerBg : AppColors.blueBg,
            border: Border.all(color: breach ? const Color(0xFFF6CFC9) : const Color(0xFFD4E6F1)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(children: [
            Text(
              settled ? l10n.ciaClaimSettled : (days != null ? (breach ? '${days.abs()} ${l10n.ciaClaimDaysOver}' : '$days ${l10n.ciaClaimDaysLeft}') : '—'),
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: breach ? AppColors.danger : AppColors.blue),
            ),
            const SizedBox(height: 2),
            Text(l10n.ciaClaimClock, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ]),
        ),
        if (breach && penal > 0)
          Container(
            padding: const EdgeInsets.all(10),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFF3E2C8))),
            child: Text('⏱ ${l10n.ciaClaimPenal} ${formatRupees(penal)}', style: const TextStyle(color: AppColors.warnAmber, fontSize: 12.5, height: 1.3)),
          ),
        if (settled && data['settledAmount'] != null)
          Container(
            padding: const EdgeInsets.all(14),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(color: const Color(0xFFE9F8EF), border: Border.all(color: const Color(0xFFBFE3CF)), borderRadius: BorderRadius.circular(12)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(l10n.ciaClaimSettledAmt, style: const TextStyle(color: AppColors.brandDark, fontWeight: FontWeight.w600, fontSize: 13)),
                Text(formatRupees(data['settledAmount']), style: const TextStyle(color: AppColors.brandDark, fontSize: 18, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
        _sectionLabel(l10n.ciaClaimDocs),
        if (docs.isNotEmpty)
          for (final d in docs) _docRow(d)
        else
          const Text('—', style: TextStyle(color: AppColors.muted)),
        const SizedBox(height: 6),
        _sectionLabel(l10n.ciaClaimProgress),
        for (int i = 0; i < kCiaClaimStages.length; i++) _stageRow(l10n, i, stage, last: i == kCiaClaimStages.length - 1),
      ],
    );
  }

  Widget _sectionLabel(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8, top: 4),
    child: Text(text.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 0.5)),
  );

  Widget _docRow(Map d) {
    final ok = (d['present'] ?? d['uploaded'] ?? d['complete'] ?? false) == true;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 20,
            height: 20,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: ok ? AppColors.brand : AppColors.line, borderRadius: BorderRadius.circular(5)),
            child: ok ? const Icon(Icons.check, size: 12, color: Colors.white) : null,
          ),
          const SizedBox(width: 10),
          Expanded(child: Text((d['label'] ?? d['key'] ?? '').toString(), style: const TextStyle(fontSize: 13.5, color: AppColors.ink))),
        ],
      ),
    );
  }

  Widget _stageRow(AppLocalizations l10n, int i, int stage, {required bool last}) {
    final state = i < stage ? 'done' : (i == stage ? 'now' : 'future');
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 16,
            child: Container(
              width: 12,
              height: 12,
              margin: const EdgeInsets.only(top: 2),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: state == 'done' ? AppColors.brand : (state == 'now' ? Colors.white : AppColors.line),
                border: state == 'now' ? Border.all(color: AppColors.brand, width: 3) : null,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              ciaClaimStageLabel(l10n, kCiaClaimStages[i]),
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                color: state == 'future' ? AppColors.muted : (state == 'now' ? AppColors.brandDark : AppColors.ink),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
