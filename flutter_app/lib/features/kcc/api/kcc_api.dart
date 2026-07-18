import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/widgets/captured_evidence.dart';

/// Wraps /kcc/* — mirrors app/app/kcc-*.tsx's apiGet/apiPost calls exactly
/// (same paths, same body field names — verified against
/// backend/src/modules/kcc/routes/kccRoutes.js). Returns the raw decoded
/// `{success, data, message, errorCode}` map — do not reshape.
class KccApi {
  KccApi(this._client);
  final ApiClient _client;

  Future<Map> calculate(
    List<Map<String, dynamic>> activities, {
    List<Map<String, dynamic>>? investmentItems,
  }) async => Map.from(
    await _client.post('/kcc/calculate', {
      'activities': activities,
      if (investmentItems != null) 'investmentItems': investmentItems,
    }),
  );

  Future<Map> eligibility() async =>
      Map.from(await _client.get('/kcc/eligibility'));

  Future<Map> apply(Map<String, dynamic> body) async =>
      Map.from(await _client.post('/kcc/apply', body));

  Future<Map> getFacility() async =>
      Map.from(await _client.get('/kcc/facility'));

  Future<Map> submitApplication(String facilityUuid) async =>
      Map.from(await _client.post('/kcc/facility/$facilityUuid/submit'));

  Future<Map> renew(String facilityUuid) async =>
      Map.from(await _client.post('/kcc/facility/$facilityUuid/renew'));

  Future<Map> listDrawdowns(String facilityUuid) async =>
      Map.from(await _client.get('/kcc/facility/$facilityUuid/drawdowns'));

  Future<Map> createDrawdown(
    String facilityUuid, {
    required String item,
    required String description,
    required num amount,
    String? quotationDocUrl,
  }) async => Map.from(
    await _client.post('/kcc/facility/$facilityUuid/drawdowns', {
      'item': item,
      'description': description,
      'amount': amount,
      if (quotationDocUrl != null) 'quotationDocUrl': quotationDocUrl,
    }),
  );

  /// Uploads a live-captured quotation photo → real contentHash + URL, for
  /// use as createDrawdown's quotationDocUrl. CLAUDE.md names "quotation
  /// photo/OCR" as a named LT-drawdown requirement; this stores the photo
  /// as attached evidence (OCR text-extraction is a separate, later item).
  Future<Map> uploadDrawdownEvidence(
    String facilityUuid,
    CapturedEvidence evidence,
  ) async => Map.from(
    await _client.postForm(
      '/kcc/facility/$facilityUuid/evidence',
      FormData.fromMap({
        'photo': MultipartFile.fromBytes(
          evidence.bytes,
          filename: 'quotation.jpg',
          contentType: DioMediaType('image', 'jpeg'),
        ),
      }),
    ),
  );

  Future<Map> submitDrawdown(String requestUuid) async =>
      Map.from(await _client.post('/kcc/drawdowns/$requestUuid/submit'));

  Future<Map> getDrawingPower(String facilityUuid) async =>
      Map.from(await _client.get('/kcc/facility/$facilityUuid/drawing-power'));

  Future<Map> getPack(String facilityUuid) async =>
      Map.from(await _client.get('/kcc/facility/$facilityUuid/pack'));
}
