import 'package:dio/dio.dart';

import '../env/env.dart';
import '../storage/secure_store.dart';
import 'api_exceptions.dart';

const _stepUpCodes = {
  'AADHAAR_STEPUP_REQUIRED',
  'AADHAAR_STEPUP_EXPIRED',
  'AADHAAR_STEPUP_INVALID',
  'AADHAAR_STEPUP_USER_MISMATCH',
};

bool _isStepUpError(dynamic data) {
  if (data is! Map) return false;
  final code = data['errorCode'] ?? data['error']?['code'];
  return _stepUpCodes.contains(code);
}

/// Typed HTTP client mirroring app/lib/api.ts's apiGet/apiPost/apiPut/
/// apiPatch/apiDiceGet/apiDicePost/apiDicePut exactly: same base URL
/// construction, same bearer-token + auto-refresh-on-401 behavior, same
/// x-aadhaar-token step-up header + 403 handling. Response bodies are
/// returned as the raw decoded JSON map (`{success, data, message,
/// errorCode}`) — do not invent new DTOs, per PRD §5.
class ApiClient {
  ApiClient._internal()
    : _dio = Dio(
        BaseOptions(
          baseUrl: Env.apiV1BaseUrl,
          connectTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 30),
          validateStatus: (_) => true, // we handle status codes ourselves
        ),
      );

  static final ApiClient instance = ApiClient._internal();
  final Dio _dio;
  bool _isRefreshing = false;

  Future<bool> _tryRefreshToken() async {
    if (_isRefreshing) return false;
    _isRefreshing = true;
    try {
      final refreshToken = await SecureStore.instance.getRefreshToken();
      if (refreshToken == null) return false;
      final res = await _dio.post(
        '/auth/refresh-token',
        data: {'refreshToken': refreshToken},
      );
      final data = res.data;
      if (data is Map &&
          data['success'] == true &&
          data['data']?['accessToken'] != null) {
        await SecureStore.instance.setToken(data['data']['accessToken']);
        if (data['data']['refreshToken'] != null) {
          await SecureStore.instance.setRefreshToken(
            data['data']['refreshToken'],
          );
        }
        return true;
      }
      return false;
    } catch (_) {
      return false;
    } finally {
      _isRefreshing = false;
    }
  }

  Future<Map<String, String>> _authHeaders() async {
    final token = await SecureStore.instance.getToken();
    return {if (token != null) 'Authorization': 'Bearer $token'};
  }

  Future<dynamic> _send(
    String method,
    String path, {
    dynamic body,
    bool retried = false,
  }) async {
    final headers = await _authHeaders();
    final res = await _dio.request(
      path,
      data: body,
      options: Options(method: method, headers: headers),
    );
    if (res.statusCode == 401 && !retried) {
      final refreshed = await _tryRefreshToken();
      if (refreshed) return _send(method, path, body: body, retried: true);
      throw UnauthorizedError();
    }
    return res.data;
  }

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      _send('POST', path, body: body ?? const {});

  /// Multipart upload — used by live-capture evidence endpoints
  /// (kavach proposal photos, claim evidence photos). `form` must be a
  /// [FormData]; Dio sets the multipart content-type automatically.
  Future<dynamic> postForm(String path, FormData form) =>
      _send('POST', path, body: form);
  Future<dynamic> put(String path, [Map<String, dynamic>? body]) =>
      _send('PUT', path, body: body ?? const {});
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) =>
      _send('PATCH', path, body: body ?? const {});

  // ─── DICE / Step-Up (Tier-2, Aadhaar-gated endpoints) ────────────────

  Future<Map<String, String>> _stepUpHeaders({
    Map<String, String> extra = const {},
  }) async {
    final token = await SecureStore.instance.getToken();
    final stepUp = await SecureStore.instance.getAadhaarToken();
    return {
      ...extra,
      if (token != null) 'Authorization': 'Bearer $token',
      if (stepUp != null) 'x-aadhaar-token': stepUp,
    };
  }

  Future<dynamic> _diceSend(
    String method,
    String path, {
    dynamic body,
    bool retried = false,
  }) async {
    final headers = await _stepUpHeaders();
    final res = await _dio.request(
      path,
      data: body,
      options: Options(method: method, headers: headers),
    );
    final data = res.data;
    if (res.statusCode == 403 && _isStepUpError(data)) {
      await SecureStore.instance.clearAadhaarToken();
      throw StepUpRequiredError(
        (data as Map)['errorCode'] ?? 'AADHAAR_STEPUP_REQUIRED',
      );
    }
    if (res.statusCode == 401 && !retried) {
      final refreshed = await _tryRefreshToken();
      if (refreshed) return _diceSend(method, path, body: body, retried: true);
      throw UnauthorizedError();
    }
    return data;
  }

  Future<dynamic> diceGet(String path) => _diceSend('GET', path);
  Future<dynamic> dicePost(String path, [Map<String, dynamic>? body]) =>
      _diceSend('POST', path, body: body ?? const {});
  Future<dynamic> dicePut(String path, [Map<String, dynamic>? body]) =>
      _diceSend('PUT', path, body: body ?? const {});
}

/// Safely coerces a raw API value (String or num, per formatRupees' doc
/// comment on why both shapes occur) into a num for arithmetic — meter
/// fractions, over-limit comparisons, cart totals. Never use a bare
/// `as num?` cast on a field read from decoded JSON.
num asNum(dynamic v, {num fallback = 0}) {
  if (v is num) return v;
  return num.tryParse(v?.toString() ?? '') ?? fallback;
}

/// Mirrors formatRupees() in app/lib/api.ts — the ONLY client-side
/// formatting allowed on statutory figures is presentation (₹ + thousands
/// separators), never recomputation.
///
/// Accepts `dynamic` rather than `num?` deliberately: raw snake_case CRUD
/// echoes (animals, coop orders, dairy events — anything backed by a
/// Sequelize DECIMAL column) serialize as JSON **strings** (e.g.
/// `"65000.00"`), while hand-built computed objects (P&L totals, KCC
/// facility, eligibility) use real JSON numbers. Coercing here means every
/// call site can pass the raw API value directly — `formatRupees(x)`, never
/// `formatRupees(x as num?)` — without needing to know or guess which shape
/// a given field is. A `num? n` cast at the call site is exactly the bug
/// this caused: "String is not a subtype of num?" the moment that field is
/// actually a stringified decimal.
String formatRupees(dynamic n) {
  final parsed = n is num ? n : num.tryParse(n?.toString() ?? '');
  if (parsed == null || parsed.isNaN) return '₹0';
  final rounded = parsed.round();
  final s = rounded.abs().toString();
  final buf = StringBuffer();
  final chars = s.split('');
  // Indian digit grouping: last 3 digits, then groups of 2.
  for (int i = 0; i < chars.length; i++) {
    final posFromEnd = chars.length - i;
    if (i > 0) {
      if (posFromEnd == 3 || (posFromEnd > 3 && (posFromEnd - 3) % 2 == 0)) {
        buf.write(',');
      }
    }
    buf.write(chars[i]);
  }
  return '₹${rounded < 0 ? '-' : ''}$buf';
}
