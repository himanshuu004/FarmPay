import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exceptions.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/cia_providers.dart';

/// CIA — tri-partite (farmer–society–bank) EMI-deduction consent. Records
/// the authorisation that flips recovery TRACK → INITIATE (Convention 33).
/// Giving consent is Aadhaar step-up protected. Mirrors
/// app/app/cia-emi-consent.tsx. Wired to POST /emi/consent (+/revoke).
class CiaEmiConsentScreen extends ConsumerStatefulWidget {
  const CiaEmiConsentScreen({super.key, this.appUuid});

  final String? appUuid;

  @override
  ConsumerState<CiaEmiConsentScreen> createState() => _CiaEmiConsentScreenState();
}

class _CiaEmiConsentScreenState extends ConsumerState<CiaEmiConsentScreen> {
  bool _loading = true;
  bool _err = false;
  String? _uuid;
  bool _active = false;
  bool _checked = false;
  bool _busy = false;

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
        final data = res['data'];
        setState(() => _active = data['mode'] == 'INITIATE' || data['consentOnFile'] == true);
      } else {
        setState(() => _err = true);
      }
    } catch (_) {
      setState(() => _err = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _give() async {
    final uuid = _uuid;
    if (uuid == null || !_checked) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final res = await ref.read(ciaApiProvider).recordEmiConsent(uuid, 'APP-ESIGN:$uuid');
      if (res['success'] == true) {
        setState(() {
          _active = true;
          _checked = false;
        });
        _showSnack(l10n.ciaEmiCGiven);
      } else {
        _showSnack((res['message'] ?? l10n.ciaLoadError).toString(), error: true);
      }
    } on StepUpRequiredError {
      _showSnack(l10n.ciaEmiCStepup, error: true);
      if (mounted) {
        context.push('/aadhaar-verify?returnTo=${Uri.encodeComponent('/cia-emi-consent?app=$uuid')}');
      }
    } catch (_) {
      _showSnack(l10n.ciaLoadError, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revoke() async {
    final uuid = _uuid;
    if (uuid == null) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final res = await ref.read(ciaApiProvider).revokeEmiConsent(uuid);
      if (res['success'] == true) {
        setState(() => _active = false);
        _showSnack(l10n.ciaEmiCRevoked);
      } else {
        _showSnack((res['message'] ?? l10n.ciaLoadError).toString(), error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showSnack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? AppColors.danger : null));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavEmiConsent)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _err
          ? _errorView(l10n)
          : _body(l10n),
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

  Widget _body(AppLocalizations l10n) => ListView(
    padding: const EdgeInsets.all(AppSpacing.lg),
    children: [
      Container(
        padding: const EdgeInsets.all(10),
        margin: const EdgeInsets.only(bottom: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(color: const Color(0xFFD8F0E1), borderRadius: BorderRadius.circular(10)),
        child: Text(
          _active ? l10n.ciaEmiCModeInitiate : l10n.ciaEmiCModeTrack,
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.brandDark),
        ),
      ),
      Row(
        children: [
          Expanded(child: _party('👨‍🌾', l10n.ciaEmiCYou)),
          const SizedBox(width: 8),
          Expanded(child: _party('🏘️', l10n.ciaEmiCSociety)),
          const SizedBox(width: 8),
          Expanded(child: _party('🏦', l10n.ciaEmiCBank)),
        ],
      ),
      const SizedBox(height: 14),
      Container(
        padding: const EdgeInsets.all(10),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFF3E2C8))),
        child: Text('📄 ${l10n.ciaEmiCPendingLegal}', style: const TextStyle(color: AppColors.warnAmber, fontSize: 12, height: 1.35)),
      ),
      Container(
        padding: const EdgeInsets.all(14),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.line)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.ciaEmiCHead, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.ink)),
            const SizedBox(height: 8),
            _bullet(l10n.ciaEmiCP1),
            _bullet(l10n.ciaEmiCP2),
            _bullet(l10n.ciaEmiCP3),
          ],
        ),
      ),
      Text(l10n.ciaEmiCDpdp, style: const TextStyle(fontSize: 11.5, color: AppColors.muted, height: 1.4)),
      const SizedBox(height: 14),
      if (_active)
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: _busy ? null : _revoke,
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, side: const BorderSide(color: Color(0xFFF1C7C1))),
            child: _busy
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.danger))
                : Text(l10n.ciaEmiCRevoke),
          ),
        )
      else ...[
        InkWell(
          onTap: () => setState(() => _checked = !_checked),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 24,
                height: 24,
                margin: const EdgeInsets.only(top: 2),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _checked ? AppColors.brand : Colors.transparent,
                  border: Border.all(color: _checked ? AppColors.brand : AppColors.line, width: 2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: _checked ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(l10n.ciaEmiCCheckbox, style: const TextStyle(fontSize: 13, height: 1.4))),
            ],
          ),
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _checked && !_busy ? _give : null,
            child: _busy
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(l10n.ciaEmiCGive),
          ),
        ),
      ],
    ],
  );

  Widget _party(String icon, String label) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: AppColors.card, border: Border.all(color: AppColors.line), borderRadius: BorderRadius.circular(12)),
    child: Column(children: [
      Text(icon, style: const TextStyle(fontSize: 22)),
      const SizedBox(height: 3),
      Text(label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.ink)),
    ]),
  );

  Widget _bullet(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('•', style: TextStyle(color: AppColors.brand, fontWeight: FontWeight.w800)),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 13, color: Color(0xFF4A5852), height: 1.35))),
      ],
    ),
  );
}
