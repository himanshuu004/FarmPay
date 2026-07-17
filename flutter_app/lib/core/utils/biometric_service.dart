import 'package:local_auth/local_auth.dart';

import '../storage/secure_store.dart';

enum BiometricCapability { fingerprint, face, iris, multiple, none }

class BiometricStatus {
  BiometricStatus({
    required this.hardwareAvailable,
    required this.enrolled,
    required this.capability,
    required this.enabled,
  });

  final bool hardwareAvailable;
  final bool enrolled;
  final BiometricCapability capability;
  final bool enabled;
}

/// Device-level biometric app-lock convenience layer — mirrors
/// app/lib/biometric.ts. This is NOT the muzzle-biometric animal-identity
/// feature (that's a backend/CV concern surfaced only as a capture flow).
/// Biometric unlock merely gates access to already-stored tokens; it is not
/// a second auth factor against device theft (Aadhaar step-up is).
class BiometricService {
  BiometricService._();
  static final BiometricService instance = BiometricService._();

  final _auth = LocalAuthentication();

  Future<BiometricStatus> getStatus() async {
    try {
      final hardwareAvailable = await _auth.isDeviceSupported();
      final enrolled = hardwareAvailable
          ? await _auth.canCheckBiometrics
          : false;
      var capability = BiometricCapability.none;
      if (enrolled) {
        final types = await _auth.getAvailableBiometrics();
        final fp =
            types.contains(BiometricType.fingerprint) ||
            types.contains(BiometricType.strong);
        final face = types.contains(BiometricType.face);
        final iris = types.contains(BiometricType.iris);
        if (fp && face) {
          capability = BiometricCapability.multiple;
        } else if (fp) {
          capability = BiometricCapability.fingerprint;
        } else if (face) {
          capability = BiometricCapability.face;
        } else if (iris) {
          capability = BiometricCapability.iris;
        }
      }
      final enabled = await SecureStore.instance.isBiometricEnabled();
      return BiometricStatus(
        hardwareAvailable: hardwareAvailable,
        enrolled: enrolled,
        capability: capability,
        enabled: enabled,
      );
    } catch (_) {
      return BiometricStatus(
        hardwareAvailable: false,
        enrolled: false,
        capability: BiometricCapability.none,
        enabled: false,
      );
    }
  }

  Future<bool> authenticate(String reason) async {
    try {
      final status = await getStatus();
      if (!status.hardwareAvailable || !status.enrolled) return false;
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
