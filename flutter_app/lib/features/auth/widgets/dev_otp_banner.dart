import 'package:flutter/material.dart';

import '../../../design_system/tokens.dart';

/// Pilot-only: shows the OTP the backend echoed back in the response
/// (`devOtp`, gated server-side behind `SHOW_DEV_OTP=true` — see
/// backend/src/modules/auth/services/authService.js). No real SMS provider
/// is wired up for the pilot, so this replaces having to check Render logs.
/// Must NEVER render if the backend didn't send a devOtp field, so it's a
/// no-op the moment a real SMS provider is wired up and the flag is unset.
class DevOtpBanner extends StatelessWidget {
  const DevOtpBanner({super.key, required this.otp});

  final String? otp;

  @override
  Widget build(BuildContext context) {
    if (otp == null || otp!.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.goldBg,
        borderRadius: BorderRadius.circular(AppRadii.button),
        border: Border.all(color: AppColors.gold.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          const Icon(Icons.science_outlined, size: 18, color: AppColors.gold),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  const TextSpan(
                    text: 'PILOT OTP: ',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.gold,
                      fontSize: 12,
                    ),
                  ),
                  TextSpan(
                    text: otp,
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      color: AppColors.gold,
                      fontSize: 16,
                      letterSpacing: 3,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
