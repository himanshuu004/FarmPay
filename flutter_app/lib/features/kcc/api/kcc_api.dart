import '../../../core/api/api_client.dart';

/// Wraps /kcc/*. Minimal today — just enough for the Home dashboard's KCC
/// journey card (mirrors app/app/(tabs)/index.tsx's apiGet("/kcc/facility"));
/// Phase 4 extends this with calculate/eligibility/apply/drawdown/pack.
class KccApi {
  KccApi(this._client);
  final ApiClient _client;

  Future<Map> getFacility() async =>
      Map.from(await _client.get('/kcc/facility'));
}
