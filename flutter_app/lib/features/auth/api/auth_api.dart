import '../../../core/api/api_client.dart';

/// Thin wrapper over /auth/* — mirrors app/lib/api.ts calls made from
/// login.tsx / register.tsx / forgot-password.tsx / aadhaar-verify.tsx
/// exactly (same paths, same body field names). Returns the raw decoded
/// `{success, data, message, errorCode}` map — do not reshape.
class AuthApi {
  AuthApi(this._client);
  final ApiClient _client;

  Future<Map> register({
    required String firstName,
    required String mobile,
  }) async => Map.from(
    await _client.post('/auth/register', {
      'firstName': firstName,
      'mobile': mobile,
    }),
  );

  Future<Map> sendOtp({
    required String mobile,
    required String purpose,
  }) async => Map.from(
    await _client.post('/auth/send-otp', {
      'mobile': mobile,
      'purpose': purpose,
    }),
  );

  Future<Map> verifyOtp({
    required String otpRequestId,
    required String otpCode,
  }) async => Map.from(
    await _client.post('/auth/verify-otp', {
      'otpRequestId': otpRequestId,
      'otpCode': otpCode,
    }),
  );

  Future<Map> setMpin({
    required String mobile,
    required String otpRequestId,
    required String mpin,
  }) async => Map.from(
    await _client.post('/auth/set-mpin', {
      'mobile': mobile,
      'otpRequestId': otpRequestId,
      'mpin': mpin,
    }),
  );

  Future<Map> login({
    required String mobile,
    required String mpin,
    required String deviceInfo,
  }) async => Map.from(
    await _client.post('/auth/login', {
      'mobile': mobile,
      'mpin': mpin,
      'deviceInfo': deviceInfo,
    }),
  );

  Future<Map> forgotMpin({required String mobile}) async =>
      Map.from(await _client.post('/auth/forgot-mpin', {'mobile': mobile}));

  Future<Map> logout({String? refreshToken}) async => Map.from(
    await _client.post('/auth/logout', {'refreshToken': refreshToken}),
  );

  Future<Map> changeMpin({
    required String currentMpin,
    required String newMpin,
  }) async => Map.from(
    await _client.post('/auth/change-mpin', {
      'currentMpin': currentMpin,
      'newMpin': newMpin,
    }),
  );

  Future<Map> getMe() async => Map.from(await _client.get('/auth/me'));

  Future<Map> sendAadhaarOtp({required String aadhaar}) async => Map.from(
    await _client.post('/auth/aadhaar/send-otp', {'aadhaar': aadhaar}),
  );

  Future<Map> verifyAadhaarOtp({
    required String otpRequestId,
    required String otpCode,
  }) async => Map.from(
    await _client.post('/auth/aadhaar/verify-otp', {
      'otpRequestId': otpRequestId,
      'otpCode': otpCode,
    }),
  );

  Future<Map> getAadhaarStatus() async =>
      Map.from(await _client.get('/auth/aadhaar/status'));

  Future<Map> getStates() async =>
      Map.from(await _client.get('/location/states'));
  Future<Map> getDistricts(int stateId) async =>
      Map.from(await _client.get('/location/states/$stateId/districts'));
  Future<Map> getBlocks(int districtId) async =>
      Map.from(await _client.get('/location/districts/$districtId/blocks'));
  Future<Map> getVillages(int blockId) async =>
      Map.from(await _client.get('/location/blocks/$blockId/villages'));

  Future<Map> onboardingStep1({
    required String firstName,
    String? lastName,
  }) async => Map.from(
    await _client.post('/farmer/onboarding/step1', {
      'firstName': firstName,
      if (lastName != null) 'lastName': lastName,
    }),
  );

  Future<Map> onboardingStep3({
    required int lgdStateId,
    required int lgdDistrictId,
    int? lgdBlockId,
    int? lgdVillageId,
  }) async => Map.from(
    await _client.post('/farmer/onboarding/step3', {
      'lgdStateId': lgdStateId,
      'lgdDistrictId': lgdDistrictId,
      if (lgdBlockId != null) 'lgdBlockId': lgdBlockId,
      if (lgdVillageId != null) 'lgdVillageId': lgdVillageId,
    }),
  );
}
