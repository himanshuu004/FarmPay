import 'dart:typed_data';

/// Result of a single live camera capture — evidence for insurance
/// enrolment/claims and (later) CIA. `contentHash` is a REAL SHA-256 hex
/// digest of `bytes` (see camera_capture_screen.dart), matching the
/// backend's `contentHash: /^[0-9a-f]{64}$/i` requirement exactly — never a
/// fabricated placeholder (Convention 9: evidence integrity).
class CapturedEvidence {
  const CapturedEvidence({
    required this.bytes,
    required this.contentHash,
    required this.capturedAt,
    this.gpsLat,
    this.gpsLng,
  });

  final Uint8List bytes;
  final String contentHash;
  final DateTime capturedAt;
  final double? gpsLat;
  final double? gpsLng;
}
