import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/widgets/captured_evidence.dart';

/// Wraps /cattle-induction/* — mirrors app/lib/ciaApi.ts's apiGet/apiPost
/// calls exactly (same paths, same body field names — verified against
/// backend/src/modules/cattle_induction/routes/ciaRoutes.js). Returns the
/// raw decoded `{success, data, message, errorCode}` map — do not reshape.
///
/// `uploadEvidence` has no RN precedent: RN's placeholderHash() satisfies
/// the backend's opaque-string ref/hash contract without real bytes ever
/// being stored anywhere. The backend had no upload route at all (same gap
/// Phase 5 found in kavach/claims) — POST .../applications/:uuid/evidence
/// was added this phase, reusing evidenceStorageService, so every doc/photo
/// ref this client sends is a real SHA-256 of real captured bytes.
class CiaApi {
  CiaApi(this._client);
  final ApiClient _client;

  static const _base = '/cattle-induction';

  // ── schemes + eligibility + EOI ──
  Future<Map> listSchemes() async => Map.from(await _client.get('$_base/schemes'));

  Future<Map> getScheme(String version) async =>
      Map.from(await _client.get('$_base/schemes/${Uri.encodeComponent(version)}'));

  Future<Map> checkEligibility({String? scheme}) async => Map.from(
    await _client.get(
      '$_base/eligibility${scheme != null ? '?scheme=${Uri.encodeComponent(scheme)}' : ''}',
    ),
  );

  Future<Map> expressInterest(String schemeVersion) async =>
      Map.from(await _client.post('$_base/interest', {'schemeVersion': schemeVersion}));

  // ── applications ──
  Future<Map> myApplications() async => Map.from(await _client.get('$_base/applications'));

  Future<Map> openDraft({int? requestedCattleCount, String? preferredBreed}) async => Map.from(
    await _client.post('$_base/applications', {
      if (requestedCattleCount != null) 'requestedCattleCount': requestedCattleCount,
      if (preferredBreed != null) 'preferredBreed': preferredBreed,
    }),
  );

  /// Uploads captured bytes → real contentHash + URL, for use as any ref field.
  Future<Map> uploadEvidence(String appUuid, CapturedEvidence evidence) async => Map.from(
    await _client.postForm(
      '$_base/applications/${Uri.encodeComponent(appUuid)}/evidence',
      FormData.fromMap({
        'photo': MultipartFile.fromBytes(
          evidence.bytes,
          filename: 'capture.jpg',
          contentType: DioMediaType('image', 'jpeg'),
        ),
      }),
    ),
  );

  Future<Map> uploadDoc(
    String appUuid, {
    required String checklistKey,
    required String docRef,
    required String contentHash,
    String? mimeType,
    Map<String, dynamic>? captureMeta,
  }) async => Map.from(
    await _client.post('$_base/applications/${Uri.encodeComponent(appUuid)}/documents', {
      'checklistKey': checklistKey,
      'docRef': docRef,
      'contentHash': contentHash,
      if (mimeType != null) 'mimeType': mimeType,
      if (captureMeta != null) 'captureMeta': captureMeta,
    }),
  );

  Future<Map> submitApplication(String appUuid) async =>
      Map.from(await _client.post('$_base/applications/${Uri.encodeComponent(appUuid)}/submit'));

  Future<Map> getStatus(String appUuid) async =>
      Map.from(await _client.get('$_base/applications/${Uri.encodeComponent(appUuid)}/status'));

  // ── guided cattle purchase ──
  Future<Map> getPurchaseState(String appUuid) async =>
      Map.from(await _client.get('$_base/applications/${Uri.encodeComponent(appUuid)}/purchase'));

  Future<Map> capturePurchase(String appUuid, Map<String, dynamic> body) async => Map.from(
    await _client.post('$_base/applications/${Uri.encodeComponent(appUuid)}/purchase/capture', body),
  );

  Future<Map> issueTransit(String appUuid, {num? sumInsured}) async => Map.from(
    await _client.post('$_base/applications/${Uri.encodeComponent(appUuid)}/insurance/transit', {
      if (sumInsured != null) 'sumInsured': sumInsured,
    }),
  );

  Future<Map> confirmArrival(String appUuid) async => Map.from(
    await _client.post('$_base/applications/${Uri.encodeComponent(appUuid)}/insurance/arrival'),
  );

  Future<Map> issueCattle(String appUuid, {required String effectiveDate, num? sumInsured}) async => Map.from(
    await _client.post('$_base/applications/${Uri.encodeComponent(appUuid)}/insurance/cattle', {
      'effectiveDate': effectiveDate,
      if (sumInsured != null) 'sumInsured': sumInsured,
    }),
  );

  // ── milk-payment EMI + consent ──
  Future<Map> getEmi(String appUuid) async =>
      Map.from(await _client.get('$_base/applications/${Uri.encodeComponent(appUuid)}/emi'));

  Future<Map> recordEmiConsent(String appUuid, String authorisationRef) async => Map.from(
    await _client.dicePost('$_base/applications/${Uri.encodeComponent(appUuid)}/emi/consent', {
      'authorisationRef': authorisationRef,
      'channel': 'app',
    }),
  );

  Future<Map> revokeEmiConsent(String appUuid) async => Map.from(
    await _client.post('$_base/applications/${Uri.encodeComponent(appUuid)}/emi/consent/revoke'),
  );

  Future<Map> getNoDues(String appUuid) async => Map.from(
    await _client.get('$_base/applications/${Uri.encodeComponent(appUuid)}/emi/no-dues-certificate'),
  );

  // ── cattle claim ──
  Future<Map> getClaim(String appUuid) async =>
      Map.from(await _client.get('$_base/applications/${Uri.encodeComponent(appUuid)}/claim'));

  Future<Map> reportClaim(String appUuid, {String? peril, String? deathDate, num? sumClaimed}) async => Map.from(
    await _client.post('$_base/applications/${Uri.encodeComponent(appUuid)}/claim', {
      if (peril != null) 'peril': peril,
      if (deathDate != null) 'deathDate': deathDate,
      if (sumClaimed != null) 'sumClaimed': sumClaimed,
    }),
  );

  // ── grievance (backend exists; RN never built a screen for this) ──
  Future<Map> raiseGrievance({
    required String category,
    String? description,
    String? applicationUuid,
    String priority = 'med',
    String channel = 'app',
  }) async => Map.from(
    await _client.post('$_base/grievances', {
      'category': category,
      if (description != null && description.isNotEmpty) 'description': description,
      if (applicationUuid != null) 'applicationUuid': applicationUuid,
      'priority': priority,
      'channel': channel,
    }),
  );

  Future<Map> listMyGrievances() async => Map.from(await _client.get('$_base/grievances'));
}

/// Statuses where the farmer's application is awaiting their details
/// (post-DCS-selection). Mirrors FILLABLE_STATUSES in ciaApi.ts.
const kCiaFillableStatuses = [
  'APPLICATION_PENDING',
  'DOCUMENTS_INCOMPLETE',
  'RETURNED_FOR_CORRECTION',
];
