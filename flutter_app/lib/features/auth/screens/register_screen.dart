import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_response.dart';
import '../../../core/providers/core_providers.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../logbook/widgets/voice_input_button.dart';
import '../providers/auth_providers.dart';
import '../widgets/auth_scaffold.dart';
import '../widgets/dev_otp_banner.dart';
import '../widgets/step_indicator.dart';

/// Mirrors app/app/register.tsx's 4-step flow exactly:
/// 1) mobile -> POST /auth/register (or /auth/send-otp if already exists)
/// 2) otp -> POST /auth/verify-otp
/// 3) mpin+confirm -> POST /auth/set-mpin, then auto POST /auth/login
/// 4) name + LGD address -> POST /farmer/onboarding/step1 + step3
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  int _step = 1;
  bool _loading = false;
  String _otpRequestId = '';
  String? _devOtp;
  Timer? _devOtpTimer;

  final _mobileCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _mpinCtrl = TextEditingController();
  final _confirmMpinCtrl = TextEditingController();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();

  List<Map> _states = [];
  List<Map> _districts = [];
  List<Map> _blocks = [];
  List<Map> _villages = [];
  int? _stateId;
  int? _districtId;
  int? _blockId;
  int? _villageId;

  @override
  void dispose() {
    _mobileCtrl.dispose();
    _otpCtrl.dispose();
    _mpinCtrl.dispose();
    _confirmMpinCtrl.dispose();
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _devOtpTimer?.cancel();
    super.dispose();
  }

  /// Pilot-only: surfaces the backend's echoed devOtp for 10s so testers
  /// don't need Render log access. No-op once SHOW_DEV_OTP is unset
  /// server-side (the field just won't be present in the response).
  void _showDevOtp(String? otp) {
    _devOtpTimer?.cancel();
    if (otp == null || otp.isEmpty) return;
    setState(() => _devOtp = otp);
    _devOtpTimer = Timer(const Duration(seconds: 10), () {
      if (mounted) setState(() => _devOtp = null);
    });
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.danger),
    );
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

  Future<void> _handleMobileContinue() async {
    final l10n = AppLocalizations.of(context);
    final mobile = _mobileCtrl.text.trim();
    if (mobile.length != 10) {
      _showError(l10n.authInvalidMobile);
      return;
    }
    await _run(() async {
      final api = ref.read(authApiProvider);
      final res = await api.register(firstName: 'Farmer', mobile: mobile);
      if (res['success'] == true) {
        _otpRequestId =
            res['data']?['otpRequestId'] ??
            res['data']?['otp_request_id'] ??
            '';
        _showDevOtp(res['data']?['devOtp']);
        setState(() => _step = 2);
        return;
      }
      final message = res['message']?.toString() ?? '';
      if (message.contains('already')) {
        final otpRes = await api.sendOtp(mobile: mobile, purpose: 'register');
        if (otpRes['success'] == true) {
          _otpRequestId = otpRes['data']?['otpRequestId'] ?? '';
          _showDevOtp(otpRes['data']?['devOtp']);
          setState(() => _step = 2);
        } else {
          _showError(apiErrorMessage(otpRes, fallback: 'Failed'));
        }
      } else {
        _showError(message.isEmpty ? 'Registration failed' : message);
      }
    });
  }

  Future<void> _handleVerifyOtp() async {
    final otp = _otpCtrl.text.trim();
    if (otp.length != 6) {
      _showError('Please enter the 6-digit OTP');
      return;
    }
    await _run(() async {
      final res = await ref
          .read(authApiProvider)
          .verifyOtp(otpRequestId: _otpRequestId, otpCode: otp);
      if (res['success'] == true) {
        setState(() => _step = 3);
      } else {
        _showError(apiErrorMessage(res, fallback: 'Invalid OTP'));
      }
    });
  }

  Future<void> _handleResendOtp() async {
    await _run(() async {
      final res = await ref
          .read(authApiProvider)
          .sendOtp(mobile: _mobileCtrl.text.trim(), purpose: 'register');
      if (res['success'] == true) {
        _otpRequestId = res['data']?['otpRequestId'] ?? '';
        _showDevOtp(res['data']?['devOtp']);
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('New OTP sent')));
        }
      } else {
        _showError(apiErrorMessage(res, fallback: 'Could not resend'));
      }
    });
  }

  Future<void> _handleSetMpin() async {
    final l10n = AppLocalizations.of(context);
    final mpin = _mpinCtrl.text.trim();
    final confirm = _confirmMpinCtrl.text.trim();
    if (mpin.length != 4) {
      _showError(l10n.authInvalidMpin);
      return;
    }
    if (mpin != confirm) {
      _showError(l10n.registerMpinMismatch);
      return;
    }
    await _run(() async {
      final api = ref.read(authApiProvider);
      final mobile = _mobileCtrl.text.trim();
      final setRes = await api.setMpin(
        mobile: mobile,
        otpRequestId: _otpRequestId,
        mpin: mpin,
      );
      if (setRes['success'] != true) {
        _showError(apiErrorMessage(setRes, fallback: 'Could not set MPIN'));
        return;
      }
      final loginRes = await api.login(
        mobile: mobile,
        mpin: mpin,
        deviceInfo: '${Platform.operatingSystem} | flutter_app',
      );
      if (loginRes['success'] == true &&
          loginRes['data']?['accessToken'] != null) {
        await ref
            .read(sessionProvider.notifier)
            .setSession(
              accessToken: loginRes['data']['accessToken'],
              refreshToken: loginRes['data']['refreshToken'],
            );
        try {
          final statesRes = await api.getStates();
          _states = List<Map>.from(statesRes['data'] ?? []);
        } catch (_) {
          // non-fatal — step 4 shows a loader if this fails
        }
        setState(() => _step = 4);
      } else {
        _showError('Login failed after MPIN set');
      }
    });
  }

  Future<void> _handleProfileSave() async {
    final firstName = _firstNameCtrl.text.trim();
    if (firstName.isEmpty) {
      _showError('Please enter your name');
      return;
    }
    if (_stateId == null || _districtId == null) {
      _showError('Please select State and District');
      return;
    }
    await _run(() async {
      final api = ref.read(authApiProvider);
      await api.onboardingStep1(
        firstName: firstName,
        lastName: _lastNameCtrl.text.trim().isEmpty
            ? null
            : _lastNameCtrl.text.trim(),
      );
      await api.onboardingStep3(
        lgdStateId: _stateId!,
        lgdDistrictId: _districtId!,
        lgdBlockId: _blockId,
        lgdVillageId: _villageId,
      );
      final store = ref.read(secureStoreProvider);
      final token = await store.getToken();
      await ref
          .read(sessionProvider.notifier)
          .setSession(
            accessToken: token!,
            user: {'mobile': _mobileCtrl.text.trim(), 'name': firstName},
          );
      // Multi-activity onboarding (activity-dairy/-goatery/-poultry) ships in
      // Phase 3 alongside the dairy logbook — land on home for now.
      if (mounted) context.go('/home');
    });
  }

  Future<void> _onStateChange(int? id) async {
    setState(() {
      _stateId = id;
      _districtId = null;
      _blockId = null;
      _villageId = null;
      _districts = [];
      _blocks = [];
      _villages = [];
    });
    if (id == null) return;
    try {
      final res = await ref.read(authApiProvider).getDistricts(id);
      setState(() => _districts = List<Map>.from(res['data'] ?? []));
    } catch (_) {}
  }

  Future<void> _onDistrictChange(int? id) async {
    setState(() {
      _districtId = id;
      _blockId = null;
      _villageId = null;
      _blocks = [];
      _villages = [];
    });
    if (id == null) return;
    try {
      final res = await ref.read(authApiProvider).getBlocks(id);
      setState(() => _blocks = List<Map>.from(res['data'] ?? []));
    } catch (_) {}
  }

  Future<void> _onBlockChange(int? id) async {
    setState(() {
      _blockId = id;
      _villageId = null;
      _villages = [];
    });
    if (id == null) return;
    try {
      final res = await ref.read(authApiProvider).getVillages(id);
      setState(() => _villages = List<Map>.from(res['data'] ?? []));
    } catch (_) {}
  }

  void _handleNext() {
    switch (_step) {
      case 1:
        _handleMobileContinue();
      case 2:
        _handleVerifyOtp();
      case 3:
        _handleSetMpin();
      case 4:
        _handleProfileSave();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AuthScaffold(
      emoji: '🌾',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.registerTitle,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          StepIndicator(
            labels: const ['Mobile', 'OTP', 'MPIN', 'Profile'],
            current: _step,
          ),
          if (_step == 1) _mobileStep(l10n),
          if (_step == 2) _otpStep(l10n),
          if (_step == 3) _mpinStep(l10n),
          if (_step == 4) _profileStep(l10n),
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
                        ? l10n.registerSendOtp
                        : _step == 2
                        ? l10n.registerOtpVerify
                        : _step == 3
                        ? l10n.registerSetMpinTitle
                        : l10n.commonSave,
                  ),
          ),
          Center(
            child: TextButton(
              onPressed: () => context.pop(),
              child: Text(l10n.registerBackToLogin),
            ),
          ),
        ],
      ),
    );
  }

  Widget _mobileStep(AppLocalizations l10n) => TextField(
    controller: _mobileCtrl,
    keyboardType: TextInputType.phone,
    maxLength: 10,
    autofocus: true,
    decoration: InputDecoration(
      labelText: l10n.registerMobile,
      counterText: '',
    ),
  );

  Widget _otpStep(AppLocalizations l10n) => Column(
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
        onPressed: _loading ? null : _handleResendOtp,
        child: Text(l10n.registerResendOtp),
      ),
    ],
  );

  Widget _mpinStep(AppLocalizations l10n) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        l10n.registerSetMpinTitle,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: AppSpacing.sm),
      TextField(
        controller: _mpinCtrl,
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
        l10n.registerConfirmMpin,
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
  );

  Widget _profileStep(AppLocalizations l10n) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: TextField(
              controller: _firstNameCtrl,
              autofocus: true,
              decoration: InputDecoration(labelText: l10n.registerFirstName),
            ),
          ),
          VoiceInputButton(
            language: 'hi',
            onResult: (t) => setState(() => _firstNameCtrl.text = t),
          ),
        ],
      ),
      const SizedBox(height: AppSpacing.md),
      Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: TextField(
              controller: _lastNameCtrl,
              decoration: InputDecoration(labelText: l10n.registerLastName),
            ),
          ),
          VoiceInputButton(
            language: 'hi',
            onResult: (t) => setState(() => _lastNameCtrl.text = t),
          ),
        ],
      ),
      const SizedBox(height: AppSpacing.lg),
      if (_states.isEmpty)
        const Center(
          child: Padding(
            padding: EdgeInsets.all(8),
            child: CircularProgressIndicator(),
          ),
        )
      else ...[
        _lgdDropdown(
          'State',
          _states,
          _stateId,
          'stateId',
          'stateName',
          _onStateChange,
        ),
        if (_districts.isNotEmpty)
          _lgdDropdown(
            'District',
            _districts,
            _districtId,
            'districtId',
            'districtName',
            _onDistrictChange,
          ),
        if (_blocks.isNotEmpty)
          _lgdDropdown(
            'Block / Tehsil',
            _blocks,
            _blockId,
            'blockId',
            'blockName',
            _onBlockChange,
          ),
        if (_villages.isNotEmpty)
          _lgdDropdown(
            'Village',
            _villages,
            _villageId,
            'villageId',
            'villageName',
            (id) => setState(() => _villageId = id),
          ),
      ],
    ],
  );

  Widget _lgdDropdown(
    String label,
    List<Map> items,
    int? selected,
    String idKey,
    String labelKey,
    void Function(int?) onChange,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: DropdownButtonFormField<int>(
        initialValue: selected,
        decoration: InputDecoration(labelText: label),
        items: items
            .map(
              (it) => DropdownMenuItem<int>(
                value: it[idKey] as int,
                child: Text(it[labelKey].toString()),
              ),
            )
            .toList(),
        onChanged: onChange,
      ),
    );
  }
}
