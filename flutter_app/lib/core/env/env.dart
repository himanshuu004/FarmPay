/// Environment config resolved entirely from `--dart-define` at build time —
/// never hardcoded, per FLUTTER-CONVERSION-PRD.md §9. Selected via
/// `--dart-define=FLAVOR=dev|staging|prod` and `--dart-define=API_BASE_URL=...`.
///
/// Example (pilot backend on Render):
///   flutter run --dart-define=FLAVOR=dev \
///     --dart-define=API_BASE_URL=https://farmpay-1l94.onrender.com
class Env {
  Env._();

  static const flavor = String.fromEnvironment('FLAVOR', defaultValue: 'dev');

  /// Root API URL, WITHOUT the /api/v1 suffix (mirrors app/lib/api.ts
  /// EXPO_PUBLIC_API_URL semantics — the client appends /api/v1 itself).
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://farmpay-1l94.onrender.com',
  );

  static String get apiV1BaseUrl => '$apiBaseUrl/api/v1';

  static bool get isDev => flavor == 'dev';
  static bool get isProd => flavor == 'prod';
}
