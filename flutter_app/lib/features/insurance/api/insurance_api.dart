import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/widgets/captured_evidence.dart';

/// Wraps /kavach/*, /claims/*, /identity/biometrics and /compliance/consent
/// — mirrors app/app/pashu-*.tsx's apiGet/apiPost calls exactly (same
/// paths, same body field names — verified against
/// backend/src/modules/{kavach,claims,identity}/routes/*.js). Returns the
/// raw decoded `{success, data, message, errorCode}` map — do not reshape.
class InsuranceApi {
  InsuranceApi(this._client);
  final ApiClient _client;

  // ── Catalog + quote + assets ──
  Future<Map> getPlans() async => Map.from(await _client.get('/kavach/plans'));

  Future<Map> quote({
    required String planCode,
    num? marketValue,
    num? milkLitresPerDay,
    int? termMonths,
  }) async => Map.from(
    await _client.post('/kavach/quote', {
      'planCode': planCode,
      if (marketValue != null) 'marketValue': marketValue,
      if (milkLitresPerDay != null) 'milkLitresPerDay': milkLitresPerDay,
      if (termMonths != null) 'termMonths': termMonths,
    }),
  );

  Future<Map> assetsMe() async =>
      Map.from(await _client.get('/kavach/assets/me'));

  // ── Proposals (enrolment) ──
  Future<Map> createProposal({
    required String planCode,
    int? assetRefId,
    num? marketValue,
  }) async => Map.from(
    await _client.post('/kavach/proposals', {
      'planCode': planCode,
      if (assetRefId != null) 'assetRefId': assetRefId,
      if (marketValue != null) 'marketValue': marketValue,
    }),
  );

  Future<Map> tagProposal(
    String proposalUuid, {
    required String tagUid,
    required String ownerPhotoUrl,
    required String tagPhotoUrl,
  }) async => Map.from(
    await _client.post('/kavach/proposals/$proposalUuid/tag', {
      'tagUid': tagUid,
      'ownerPhotoUrl': ownerPhotoUrl,
      'tagPhotoUrl': tagPhotoUrl,
    }),
  );

  /// Uploads a live-captured photo for a proposal (owner+animal or tag
  /// close-up) and returns `{url, contentHash}` — the `url` is then passed
  /// into [tagProposal] as ownerPhotoUrl/tagPhotoUrl. Camera-only capture
  /// happens in CameraCaptureScreen; this just persists the bytes.
  Future<Map> uploadProposalPhoto(
    String proposalUuid,
    CapturedEvidence evidence,
  ) async {
    final form = FormData.fromMap({
      'photo': MultipartFile.fromBytes(
        evidence.bytes,
        filename: 'capture.jpg',
        contentType: DioMediaType('image', 'jpeg'),
      ),
    });
    return Map.from(
      await _client.postForm('/kavach/proposals/$proposalUuid/photo', form),
    );
  }

  // ── Policies ──
  Future<Map> policiesMe() async =>
      Map.from(await _client.get('/kavach/policies/me'));

  Future<Map> getPolicy(String policyUuid) async =>
      Map.from(await _client.get('/kavach/policies/$policyUuid'));

  // ── Renewals (farmer-owned, opt-in only) ──
  Future<Map> renewalsDue() async =>
      Map.from(await _client.get('/kavach/renewals/due'));

  Future<Map> renew(String policyUuid) async =>
      Map.from(await _client.post('/kavach/renewals/$policyUuid/renew'));

  Future<Map> optInRenewal(String journeyUuid) async =>
      Map.from(await _client.post('/kavach/renewals/$journeyUuid/opt-in'));

  Future<Map> optOutRenewal(String journeyUuid) async =>
      Map.from(await _client.post('/kavach/renewals/$journeyUuid/opt-out'));

  // ── Claims ──
  Future<Map> claimsMe() async => Map.from(await _client.get('/claims/me'));

  Future<Map> getClaim(String claimUuid) async =>
      Map.from(await _client.get('/claims/$claimUuid'));

  Future<Map> intimateClaim({
    required String policyUuid,
    required String peril,
  }) async => Map.from(
    await _client.post('/claims', {'policyUuid': policyUuid, 'peril': peril}),
  );

  Future<Map> addEvidence(
    String claimUuid, {
    required String kind,
    required String objectKey,
    required String contentHash,
    double? gpsLat,
    double? gpsLng,
    DateTime? capturedAt,
  }) async => Map.from(
    await _client.post('/claims/$claimUuid/evidence', {
      'kind': kind,
      'objectKey': objectKey,
      'contentHash': contentHash,
      if (gpsLat != null) 'gpsLat': gpsLat,
      if (gpsLng != null) 'gpsLng': gpsLng,
      if (capturedAt != null) 'capturedAt': capturedAt.toIso8601String(),
    }),
  );

  /// Uploads a live-captured claim document photo and returns
  /// `{objectKey, contentHash}` for [addEvidence].
  Future<Map> uploadEvidencePhoto(
    String claimUuid,
    CapturedEvidence evidence,
  ) async {
    final form = FormData.fromMap({
      'photo': MultipartFile.fromBytes(
        evidence.bytes,
        filename: 'capture.jpg',
        contentType: DioMediaType('image', 'jpeg'),
      ),
    });
    return Map.from(
      await _client.postForm('/claims/$claimUuid/evidence/photo', form),
    );
  }

  Future<Map> submitDocs(String claimUuid) async =>
      Map.from(await _client.post('/claims/$claimUuid/submit-docs'));

  // ── Identity / muzzle biometrics (shadow-mode second factor; never gates) ──
  Future<Map> postBiometric({
    int? animalId,
    String? tagUid,
    required List<num> embedding,
    required double quality,
  }) async => Map.from(
    await _client.post('/identity/biometrics', {
      if (animalId != null) 'animalId': animalId,
      if (tagUid != null) 'tagUid': tagUid,
      'embedding': embedding,
      'quality': quality,
    }),
  );

  // ── DPDP consent ──
  Future<Map> postConsent({
    required String consentType,
    String version = 'v1',
  }) async => Map.from(
    await _client.post('/compliance/consent', {
      'consentType': consentType,
      'version': version,
    }),
  );
}
