/// Mirrors StepUpRequiredError in app/lib/api.ts — thrown when a DICE
/// (Aadhaar step-up) endpoint returns 403 with one of the step-up error
/// codes, so the caller can navigate to the Aadhaar verify screen.
class StepUpRequiredError implements Exception {
  StepUpRequiredError([this.code = 'AADHAAR_STEPUP_REQUIRED']);
  final String code;

  @override
  String toString() => 'StepUpRequiredError($code)';
}

class UnauthorizedError implements Exception {
  @override
  String toString() => 'UNAUTHORIZED';
}

class ApiException implements Exception {
  ApiException(this.message, {this.errorCode, this.statusCode});
  final String message;
  final String? errorCode;
  final int? statusCode;

  @override
  String toString() => 'ApiException($statusCode, $errorCode): $message';
}
