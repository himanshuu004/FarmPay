import '../../../core/api/api_client.dart';

/// Wraps /advisory/*. Minimal today — just enough for the Home dashboard's
/// urgent-alert card (mirrors app/app/(tabs)/index.tsx's
/// apiGet("/advisory/feed?status=OPEN")).
class AdvisoryApi {
  AdvisoryApi(this._client);
  final ApiClient _client;

  Future<Map> feed({String status = 'OPEN'}) async =>
      Map.from(await _client.get('/advisory/feed?status=$status'));
}
