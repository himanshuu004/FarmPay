import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_response.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/auth_providers.dart';
import '../widgets/auth_scaffold.dart';
import '../widgets/dev_otp_banner.dart';
import '../widgets/step_indicator.dart';

/// Mirrors app/app/forgot-password.tsx: mobile -> forgot-mpin, otp ->
/// verify-otp, new mpin -> set-mpin, then back to login.
class ForgotMpinScreen extends ConsumerStatefulWidget {
  const ForgotMpinScreen({super.key});

  @override
  ConsumerState<ForgotMpinScreen> createState() => _ForgotMpinScreenState();
}

class _ForgotMpinScreenState extends ConsumerState<ForgotMpinScreen> {
  int _step = 1;
  bool _loading = false;
  String _otpRequestId = '';
  String? _devOtp;
  Timer? _devOtpTimer;

  final _mobileCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _newMpinCtrl = TextEditingController();
  final _confirmMpinCtrl = TextEditingController();

  @override
  void dispose() {
    _devOtpTimer?.cancel();
    _mobileCtrl.dispose();
    _otpCtrl.dispose();
    _newMpinCtrl.dispose();
    _confirmMpinCtrl.dispose();
    super.dispose();
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.danger),
    );
  }

  /// Pilot-only: see register_screen.dart's _showDevOtp for the full
  /// rationale — surfaces the backend's echoed devOtp for 10s.
  void _showDevOtp(String? otp) {
    _devOtpTimer?.cancel();
    if (otp == null || otp.isEmpty) return;
    setState(() => _devOtp = otp);
    _devOtpTimer = Timer(const Duration(seconds: 10), () {
      if (mounted) setState(() => _devOtp = null);
    });
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => _loading = true);
    try {
      await fn();
    } catch (_) {
      if (mounted) _showError(AppLocalizations.of(context).authCannotConnect);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handleSendOtp() async {
    final l10n = AppLocalizations.of(context);
    if (_mobileCtrl.text.trim().length != 10) {
      _showError(l10n.authInvalidMobile);
      return;
    }
    await _run(() async {
      final res = await ref
          .read(authApiProvider)
          .forgotMpin(mobile: _mobileCtrl.text.trim());
      if (res['success'] == true) {
        _otpRequestId =
            res['data']?['otpRequestId'] ??
            res['data']?['otp_request_id'] ??
            '';
        _showDevOtp(res['data']?['devOtp']);
        setState(() => _step = 2);
      } else {
        _showError(apiErrorMessage(res, fallback: 'Could not send OTP'));
      }
    });
  }

  Future<void> _handleVerifyOtp() async {
    if (_otpCtrl.text.trim().length != 6) {
      _showError('Please enter the 6-digit OTP');
      return;
    }
    await _run(() async {
      final res = await ref
          .read(authApiProvider)
          .verifyOtp(
            otpRequestId: _otpRequestId,
            otpCode: _otpCtrl.text.trim(),
          );
      if (res['success'] == true) {
        setState(() => _step = 3);
      } else {
        _showError(apiErrorMessage(res, fallback: 'Invalid OTP'));
      }
    });
  }

  Future<void> _handleReset() async {
    final l10n = AppLocalizations.of(context);
    if (_newMpinCtrl.text.trim().length != 4) {
      _showError(l10n.authInvalidMpin);
      return;
    }
    if (_newMpinCtrl.text.trim() != _confirmMpinCtrl.text.trim()) {
      _showError(l10n.registerMpinMismatch);
      return;
    }
    await _run(() async {
      final res = await ref
          .read(authApiProvider)
          .setMpin(
            mobile: _mobileCtrl.text.trim(),
            otpRequestId: _otpRequestId,
            mpin: _newMpinCtrl.text.trim(),
          );
      if (res['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(l10n.forgotMpinSuccess)));
          context.go('/login');
        }
      } else {
        _showError(apiErrorMessage(res, fallback: 'MPIN reset failed'));
      }
    });
  }

  void _handleNext() {
    switch (_step) {
      case 1:
        _handleSendOtp();
      case 2:
        _handleVerifyOtp();
      case 3:
        _handleReset();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AuthScaffold(
      emoji: '🔑',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.forgotMpinTitle,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          StepIndicator(
            labels: const ['Mobile', 'OTP', 'MPIN'],
            current: _step,
          ),
          if (_step == 1)
            TextField(
              controller: _mobileCtrl,
              keyboardType: TextInputType.phone,
              maxLength: 10,
              autofocus: true,
              decoration: InputDecoration(
                labelText: l10n.forgotMpinMobile,
                counterText: '',
              ),
            ),
          if (_step == 2)
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.registerOtpTitle(_mobileCtrl.text),
                  style: const TextStyle(color: AppColors.muted),
                ),
                const SizedBox(height: AppSpacing.sm),
                DevOtpBanner(otp: _devOtp),
                TextField(
                  controller: _otpCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  autofocus: true,
                  decoration: const InputDecoration(counterText: ''),
                ),
                TextButton(
                  onPressed: _loading ? null : _handleSendOtp,
                  child: Text(l10n.registerResendOtp),
                ),
              ],
            ),
          if (_step == 3)
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.forgotMpinNewMpin,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: AppSpacing.sm),
                TextField(
                  controller: _newMpinCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 4,
                  obscureText: true,
                  autofocus: true,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 10,
                  ),
                  decoration: const InputDecoration(counterText: ''),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  l10n.forgotMpinConfirmMpin,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: AppSpacing.sm),
                TextField(
                  controller: _confirmMpinCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 4,
                  obscureText: true,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 10,
                  ),
                  decoration: const InputDecoration(counterText: ''),
                ),
              ],
            ),
          const SizedBox(height: AppSpacing.lg),
          ElevatedButton(
            onPressed: _loading ? null : _handleNext,
            child: _loading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    _step == 1
                        ? l10n.forgotMpinSendOtp
                        : _step == 2
                        ? l10n.forgotMpinVerify
                        : l10n.forgotMpinReset,
                  ),
          ),
          Center(
            child: TextButton(
              onPressed: () => context.pop(),
              child: Text(l10n.forgotMpinBackToLogin),
            ),
          ),
        ],
      ),
    );
  }
}
