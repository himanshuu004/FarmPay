import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/storage/secure_store.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/auth_providers.dart';

/// Tier-2 (DICE) Aadhaar step-up screen — mirrors app/app/aadhaar-verify.tsx.
/// Required before financial operations that call apiDice*() endpoints;
/// issues a 15-min step-up token stored via SecureStore.setAadhaarSession.
class AadhaarVerifyScreen extends ConsumerStatefulWidget {
  const AadhaarVerifyScreen({super.key, this.returnTo});

  final String? returnTo;

  @override
  ConsumerState<AadhaarVerifyScreen> createState() =>
      _AadhaarVerifyScreenState();
}

class _AadhaarVerifyScreenState extends ConsumerState<AadhaarVerifyScreen> {
  bool _otpStep = false;
  bool _loading = false;
  String _otpRequestId = '';
  String _aadhaarLast4 = '';
  String? _demoOtp;

  final _aadhaarCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.danger),
    );
  }

  Future<void> _sendOtp() async {
    final l10n = AppLocalizations.of(context);
    final raw = _aadhaarCtrl.text.replaceAll(' ', '');
    if (raw.length != 12) {
      _showError(l10n.aadhaarInvalid);
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await ref.read(authApiProvider).sendAadhaarOtp(aadhaar: raw);
      if (res['success'] == true) {
        setState(() {
          _otpRequestId = res['data']['otpRequestId'];
          _aadhaarLast4 = res['data']['aadhaarLast4'] ?? raw.substring(8);
          _demoOtp = res['data']['demoOtp'];
          _otpStep = true;
        });
      } else {
        _showError(res['message'] ?? 'Failed to send OTP');
      }
    } catch (_) {
      _showError(l10n.authCannotConnect);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyOtp() async {
    if (_otpCtrl.text.trim().length != 6) {
      _showError('Please enter the 6-digit OTP');
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await ref
          .read(authApiProvider)
          .verifyAadhaarOtp(
            otpRequestId: _otpRequestId,
            otpCode: _otpCtrl.text.trim(),
          );
      if (res['success'] == true) {
        await SecureStore.instance.setAadhaarSession(
          res['data']['stepUpToken'],
          res['data']['expiresAt'],
          res['data']['aadhaarLast4'] ?? _aadhaarLast4,
        );
        if (mounted) context.go(widget.returnTo ?? '/kcc');
      } else {
        _showError(res['message'] ?? 'Verification failed');
      }
    } catch (_) {
      if (mounted) _showError(AppLocalizations.of(context).authCannotConnect);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.aadhaarStepUpTitle),
        backgroundColor: const Color(0xFFE65100),
      ),
      backgroundColor: const Color(0xFFFFF3E0),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                alignment: Alignment.centerLeft,
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFE65100),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '🛡️ ${l10n.aadhaarBadge.toUpperCase()}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                l10n.aadhaarStepUpTitle,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                l10n.aadhaarStepUpBody,
                style: const TextStyle(color: AppColors.muted, height: 1.4),
              ),
              const SizedBox(height: AppSpacing.xl),
              if (!_otpStep) ...[
                Text(
                  l10n.aadhaarNumber,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: AppSpacing.sm),
                TextField(
                  controller: _aadhaarCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 14,
                  autofocus: true,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 2,
                  ),
                  decoration: const InputDecoration(
                    hintText: '1234 5678 9012',
                    counterText: '',
                  ),
                  onChanged: (v) {
                    final digits = v
                        .replaceAll(RegExp(r'\D'), '')
                        .substring(0, v.length > 12 ? 12 : null);
                    final formatted = digits.replaceAllMapped(
                      RegExp(r'(\d{4})(\d{0,4})(\d{0,4})'),
                      (m) => [
                        m[1],
                        m[2],
                        m[3],
                      ].where((s) => s != null && s.isNotEmpty).join(' '),
                    );
                    if (formatted != v) {
                      _aadhaarCtrl.value = TextEditingValue(
                        text: formatted,
                        selection: TextSelection.collapsed(
                          offset: formatted.length,
                        ),
                      );
                    }
                  },
                ),
                const SizedBox(height: AppSpacing.lg),
                ElevatedButton(
                  onPressed: _loading ? null : _sendOtp,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE65100),
                  ),
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(l10n.aadhaarSendOtp),
                ),
              ] else ...[
                Center(
                  child: Column(
                    children: [
                      Text(
                        l10n.aadhaarOtpSentTo('XXXX XXXX $_aadhaarLast4'),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (_demoOtp != null) ...[
                        const SizedBox(height: AppSpacing.sm),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFF9C4),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            'DEMO OTP: $_demoOtp',
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              color: Color(0xFFE65100),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                TextField(
                  controller: _otpCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  autofocus: true,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 28, letterSpacing: 10),
                  decoration: const InputDecoration(counterText: ''),
                ),
                const SizedBox(height: AppSpacing.lg),
                ElevatedButton(
                  onPressed: _loading ? null : _verifyOtp,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE65100),
                  ),
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(l10n.aadhaarVerifyOtp),
                ),
                Center(
                  child: TextButton(
                    onPressed: () => setState(() {
                      _otpStep = false;
                      _otpCtrl.clear();
                    }),
                    child: Text(l10n.aadhaarResend),
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              Text(
                '🔒 ${l10n.aadhaarDpdpFooter}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11, color: AppColors.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
