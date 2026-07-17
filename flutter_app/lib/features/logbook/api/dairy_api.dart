import '../../../core/api/api_client.dart';

/// Wraps /livestock/* — mirrors app/app/dairy-*.tsx's apiGet/apiPost calls
/// exactly (same paths, same body field names — verified against
/// backend/src/modules/livestock/routes/dairyV2Routes.js). Returns the raw
/// decoded `{success, data, message, errorCode}` map — do not reshape.
///
/// Response `data` shape varies by endpoint: CRUD echoes (animals, cost/
/// revenue/treatment/breeding events, profile) are raw snake_case Sequelize
/// rows; computed reports (herd/per-animal P&L, aggregate-herd save) are
/// hand-built camelCase objects. Callers must read the right case per call.
class DairyApi {
  DairyApi(this._client);
  final ApiClient _client;

  Future<Map> getProfile() async =>
      Map.from(await _client.get('/livestock/profile'));

  Future<Map> upsertProfile(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/profile', body));

  Future<Map> listAnimals() async =>
      Map.from(await _client.get('/livestock/animals'));

  Future<Map> addAnimal(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/animals', body));

  Future<Map> createRevenueEvent(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/revenue-events', body));

  Future<Map> createCostEvent(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/cost-events', body));

  Future<Map> createTreatmentEvent(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/treatment', body));

  Future<Map> createBreedingEvent(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/breeding', body));

  Future<Map> getHerdPnl({
    required String startDate,
    required String endDate,
  }) async => Map.from(
    await _client.get(
      '/livestock/pnl/herd?startDate=$startDate&endDate=$endDate',
    ),
  );

  Future<Map> getPerAnimalPnl({
    required String startDate,
    required String endDate,
  }) async => Map.from(
    await _client.get(
      '/livestock/pnl/per-animal?startDate=$startDate&endDate=$endDate',
    ),
  );

  /// setup-dairy.tsx's prefill call — no matching backend route exists
  /// (dairyV2Routes.js has no GET /herd/summary), so this always 404s.
  /// The RN app swallows the failure and falls back to zeroed defaults;
  /// replicated faithfully rather than silently "fixed" — see
  /// FLUTTER-CONVERSION-PRD parity notes.
  Future<Map?> getHerdSummary() async {
    try {
      return Map.from(await _client.get('/livestock/herd/summary'));
    } catch (_) {
      return null;
    }
  }

  Future<Map> saveAggregateHerd(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/herd/aggregate', body));
}

/// Defensively coerces the mixed string/num typing that P&L responses
/// return (totals are toFixed(2) strings, category maps are raw floats).
num parseNum(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v;
  return num.tryParse(v.toString()) ?? 0;
}
