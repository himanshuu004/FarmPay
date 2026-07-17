/// Extracts a human-readable message from a backend response, mirroring the
/// shape every controller returns: `{success, message, errors?: [{field,
/// message}], errorCode?}`. Validation failures (Joi) put the actually
/// useful text in `errors[0].message` — the top-level `message` is just the
/// generic "Validation failed", so reading only `res['message']` silently
/// swallows the real reason (e.g. "MPIN is too simple. Avoid patterns like
/// 1234 or 0000"). Every screen must use this instead of `res['message']`
/// directly when surfacing an error to the farmer.
String apiErrorMessage(
  dynamic res, {
  String fallback = 'Something went wrong',
}) {
  if (res is! Map) return fallback;
  final errors = res['errors'];
  if (errors is List && errors.isNotEmpty) {
    final first = errors.first;
    if (first is Map && first['message'] != null) {
      return first['message'].toString();
    }
  }
  final message = res['message'];
  if (message != null && message.toString().isNotEmpty)
    return message.toString();
  return fallback;
}
