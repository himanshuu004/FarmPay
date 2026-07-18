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

  Future<Map> listAnimals({String? status}) async => Map.from(
    await _client.get(
      '/livestock/animals${status != null ? '?status=$status' : ''}',
    ),
  );

  Future<Map> addAnimal(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/animals', body));

  /// kcc-calculator.tsx's "Sold?" action — marks an animal exited so it
  /// drops out of the live KCC unit count automatically.
  Future<Map> exitAnimal(String animalUuid, Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/animals/$animalUuid/exit', body));

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

  /// setup-dairy.tsx's edit-mode prefill call. The RN app's equivalent
  /// call 404s (no matching route ever existed in dairyV2Routes.js); added
  /// GET /livestock/herd/summary server-side (bucketed by species — see
  /// dairyAggregateService.js's getHerdSummary doc comment for why the
  /// cows/mixed split can't be exactly reconstructed) so edit mode
  /// actually prefills instead of always showing zeroed defaults.
  Future<Map?> getHerdSummary() async {
    try {
      return Map.from(await _client.get('/livestock/herd/summary'));
    } catch (_) {
      return null;
    }
  }

  Future<Map> saveAggregateHerd(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/livestock/herd/aggregate', body));

  /// Wraps /farmer/activity-subscriptions — used by setup-goatery/
  /// setup-poultry.tsx's aggregate-count save (no dedicated goatery/
  /// poultry endpoint exists yet; RN's own workaround, replicated as-is).
  Future<Map> listActivitySubscriptions() async =>
      Map.from(await _client.get('/farmer/activity-subscriptions'));

  Future<Map> patchActivitySubscription(
    String subscriptionId,
    Map<String, dynamic> body,
  ) async => Map.from(
    await _client.patch('/farmer/activity-subscriptions/$subscriptionId', body),
  );
}

/// Defensively coerces the mixed string/num typing that P&L responses
/// return (totals are toFixed(2) strings, category maps are raw floats).
num parseNum(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v;
  return num.tryParse(v.toString()) ?? 0;
}
