import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Token/user storage, replacing `AsyncStorage` in app/lib/api.ts with
/// encrypted-at-rest secure storage (JWT + refresh token are sensitive).
class SecureStore {
  SecureStore._();
  static final SecureStore instance = SecureStore._();

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _kToken = 'fp_token';
  static const _kRefreshToken = 'fp_refresh_token';
  static const _kUser = 'fp_user';
  static const _kLang = 'fp_lang';
  static const _kBiometricEnabled = 'fp_biometric_enabled';
  static const _kAadhaarToken = 'fp_aadhaar_token';
  static const _kAadhaarExpiresAt = 'fp_aadhaar_expires_at';
  static const _kAadhaarLast4 = 'fp_aadhaar_last4';

  Future<String?> getToken() => _storage.read(key: _kToken);
  Future<void> setToken(String token) =>
      _storage.write(key: _kToken, value: token);

  Future<String?> getRefreshToken() => _storage.read(key: _kRefreshToken);
  Future<void> setRefreshToken(String token) =>
      _storage.write(key: _kRefreshToken, value: token);

  Future<Map<String, dynamic>?> getUser() async {
    final raw = await _storage.read(key: _kUser);
    if (raw == null) return null;
    return jsonDecode(raw) as Map<String, dynamic>;
  }

  Future<void> setUser(Map<String, dynamic> user) =>
      _storage.write(key: _kUser, value: jsonEncode(user));

  Future<String?> getLang() => _storage.read(key: _kLang);
  Future<void> setLang(String lang) => _storage.write(key: _kLang, value: lang);

  Future<bool> isBiometricEnabled() async =>
      (await _storage.read(key: _kBiometricEnabled)) == 'true';
  Future<void> setBiometricEnabled(bool enabled) =>
      _storage.write(key: _kBiometricEnabled, value: enabled.toString());

  /// Returns the step-up token only if still within its 15-min TTL — mirrors
  /// getAadhaarToken() in app/lib/aadhaarAuth.ts (auto-clears on expiry).
  Future<String?> getAadhaarToken() async {
    final token = await _storage.read(key: _kAadhaarToken);
    if (token == null) return null;
    final expiresAtRaw = await _storage.read(key: _kAadhaarExpiresAt);
    if (expiresAtRaw == null) return null;
    final expiresAt = DateTime.tryParse(expiresAtRaw);
    if (expiresAt == null || !expiresAt.isAfter(DateTime.now())) {
      await clearAadhaarToken();
      return null;
    }
    return token;
  }

  Future<void> setAadhaarSession(
    String token,
    String expiresAt,
    String last4,
  ) async {
    await _storage.write(key: _kAadhaarToken, value: token);
    await _storage.write(key: _kAadhaarExpiresAt, value: expiresAt);
    await _storage.write(key: _kAadhaarLast4, value: last4);
  }

  Future<DateTime?> getAadhaarExpiresAt() async {
    final raw = await _storage.read(key: _kAadhaarExpiresAt);
    return raw == null ? null : DateTime.tryParse(raw);
  }

  Future<void> clearAadhaarToken() async {
    await _storage.delete(key: _kAadhaarToken);
    await _storage.delete(key: _kAadhaarExpiresAt);
    await _storage.delete(key: _kAadhaarLast4);
  }

  /// Mirrors clearAllTokens() in app/lib/api.ts.
  Future<void> clearAllTokens() async {
    await _storage.delete(key: _kToken);
    await _storage.delete(key: _kRefreshToken);
    await _storage.delete(key: _kUser);
    await clearAadhaarToken();
  }
}
