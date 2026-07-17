import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/storage/secure_store.dart';
import '../../../core/utils/biometric_service.dart';
import '../../../design_system/tokens.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/auth_providers.dart';
import '../widgets/auth_scaffold.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _mobileCtrl = TextEditingController();
  final _mpinCtrl = TextEditingController();
  bool _loading = false;
  bool _bootChecking = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootCheck());
  }

  @override
  void dispose() {
    _mobileCtrl.dispose();
    _mpinCtrl.dispose();
    super.dispose();
  }

  Future<void> _bootCheck() async {
    try {
      final existingToken = await SecureStore.instance.getToken();
      if (existingToken == null) return;
      final enabled = await SecureStore.instance.isBiometricEnabled();
      if (!enabled) {
        await ref.read(sessionProvider.notifier).hydrate();
        if (mounted) context.go('/home');
        return;
      }
      if (!mounted) return;
      final l10n = AppLocalizations.of(context);
      final ok = await BiometricService.instance.authenticate(l10n.authUnlock);
      if (ok) {
        await ref.read(sessionProvider.notifier).hydrate();
        if (mounted) context.go('/home');
      }
    } finally {
      if (mounted) setState(() => _bootChecking = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.danger),
    );
  }

  Future<void> _handleLogin() async {
    final l10n = AppLocalizations.of(context);
    final mobile = _mobileCtrl.text.trim();
    final mpin = _mpinCtrl.text.trim();
    if (mobile.length != 10) {
      _showError(l10n.authInvalidMobile);
      return;
    }
    if (mpin.length != 4) {
      _showError(l10n.authInvalidMpin);
      return;
    }
    setState(() => _loading = true);
    try {
      final res = await ref
          .read(authApiProvider)
          .login(
            mobile: mobile,
            mpin: mpin,
            deviceInfo: '${Platform.operatingSystem} | flutter_app',
          );
      if (res['success'] == true && res['data']?['accessToken'] != null) {
        final data = res['data'] as Map;
        await ref
            .read(sessionProvider.notifier)
            .setSession(
              accessToken: data['accessToken'],
              refreshToken: data['refreshToken'],
              user: {
                'mobile': mobile,
                'name': data['user']?['firstName'] ?? mobile,
              },
            );
        if (!mounted) return;

        final bio = await BiometricService.instance.getStatus();
        if (!mounted) return;
        if (bio.hardwareAvailable && bio.enrolled && !bio.enabled) {
          _offerBiometricOptIn(l10n, bio);
        } else {
          context.go('/home');
        }
      } else {
        _showError(res['message'] ?? l10n.authLoginFailed);
      }
    } catch (_) {
      _showError(l10n.authCannotConnect);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _offerBiometricOptIn(AppLocalizations l10n, BiometricStatus bio) {
    final methodName = bio.capability == BiometricCapability.face
        ? 'Face ID'
        : 'fingerprint';
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.authFasterSignIn),
        content: Text(l10n.authEnableBiometricBody(methodName)),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.go('/home');
            },
            child: Text(l10n.authNotNow),
          ),
          TextButton(
            onPressed: () async {
              final ok = await BiometricService.instance.authenticate(
                l10n.authUnlock,
              );
              if (ok) await SecureStore.instance.setBiometricEnabled(true);
              if (ctx.mounted) Navigator.of(ctx).pop();
              if (mounted) context.go('/home');
            },
            child: Text(l10n.authEnable),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    if (_bootChecking) {
      return const Scaffold(
        backgroundColor: AppColors.brandDark,
        body: Center(child: CircularProgressIndicator(color: Colors.white)),
      );
    }

    return AuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.authAppName,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 4),
          Text(
            l10n.authTagline,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.muted),
          ),
          const SizedBox(height: AppSpacing.xl),
          TextField(
            controller: _mobileCtrl,
            keyboardType: TextInputType.phone,
            maxLength: 10,
            decoration: InputDecoration(
              labelText: l10n.authMobileNumber,
              counterText: '',
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _mpinCtrl,
            keyboardType: TextInputType.number,
            maxLength: 4,
            obscureText: true,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              letterSpacing: 12,
            ),
            decoration: InputDecoration(
              labelText: l10n.authMpin,
              counterText: '',
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          ElevatedButton(
            onPressed: _loading ? null : _handleLogin,
            child: _loading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(l10n.authSignIn),
          ),
          const SizedBox(height: AppSpacing.md),
          Center(
            child: TextButton(
              onPressed: () => context.push('/forgot-mpin'),
              child: Text(l10n.authForgotMpin),
            ),
          ),
          Center(
            child: TextButton(
              onPressed: () => context.push('/register'),
              child: Text(l10n.authNewHereRegister),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Center(
            child: Text(
              l10n.authFooterSecured,
              style: const TextStyle(fontSize: 11, color: Color(0xFFBBBBBB)),
            ),
          ),
        ],
      ),
    );
  }
}
