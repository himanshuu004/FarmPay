import '../../../core/api/api_client.dart';

/// Wraps /coop/* — mirrors app/app/society-*.tsx's apiGet/apiPost calls
/// exactly (same paths, same body shapes). Returns the raw decoded
/// `{success, data, message, errorCode}` map — do not reshape.
class CoopApi {
  CoopApi(this._client);
  final ApiClient _client;

  Future<Map> getPassbook() async =>
      Map.from(await _client.get('/coop/passbook'));

  Future<Map> getCatalog() async =>
      Map.from(await _client.get('/coop/catalog'));

  /// Read-only mirror of the same demand-window gate submitOrder()
  /// enforces server-side — lets the order screen show the prototype's
  /// window banner proactively instead of only on a failed submit.
  Future<Map> getDemandWindow() async =>
      Map.from(await _client.get('/coop/demand-window'));

  Future<Map> listOrders() async => Map.from(await _client.get('/coop/orders'));

  Future<Map> createDraft(List<Map<String, dynamic>> lines) async =>
      Map.from(await _client.post('/coop/orders', {'lines': lines}));

  Future<Map> submitOrder(String orderUuid) async =>
      Map.from(await _client.post('/coop/orders/$orderUuid/submit'));

  Future<Map> confirmReceipt(String orderUuid) async =>
      Map.from(await _client.post('/coop/orders/$orderUuid/receipt'));
}
