import '../../../core/api/api_client.dart';

/// Wraps /kavach/*. Minimal today — just enough for the Home dashboard's
/// protection snapshot + renewal-due alert (mirrors
/// app/app/(tabs)/index.tsx's apiGet("/kavach/policies/me") and
/// apiGet("/kavach/renewals/due")); Phase 5 extends this with the full
/// quote/enrol/vault/renew/claim surface.
class InsuranceApi {
  InsuranceApi(this._client);
  final ApiClient _client;

  Future<Map> policiesMe() async =>
      Map.from(await _client.get('/kavach/policies/me'));

  Future<Map> renewalsDue() async =>
      Map.from(await _client.get('/kavach/renewals/due'));
}
