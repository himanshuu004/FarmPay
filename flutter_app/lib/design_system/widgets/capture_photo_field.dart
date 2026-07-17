import 'package:flutter/material.dart';

import '../tokens.dart';
import 'camera_capture_screen.dart';
import 'captured_evidence.dart';

/// A single "capture this evidence" control — camera-only, never a gallery
/// picker (Convention 9/25/32). Shows an outlined chip until captured, then
/// a filled done-chip with a retake affordance. Used by pashu-enrol (owner +
/// tag photos) and pashu-claim (4-document checklist), and will be reused
/// by CIA's live-capture evidence flows later.
class CapturePhotoField extends StatelessWidget {
  const CapturePhotoField({
    super.key,
    required this.label,
    required this.captured,
    required this.onCaptured,
  });

  final String label;
  final CapturedEvidence? captured;
  final ValueChanged<CapturedEvidence> onCaptured;

  Future<void> _open(BuildContext context) async {
    final result = await Navigator.of(context).push<CapturedEvidence>(
      MaterialPageRoute(builder: (_) => CameraCaptureScreen(title: label)),
    );
    if (result != null) onCaptured(result);
  }

  @override
  Widget build(BuildContext context) {
    final done = captured != null;
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadii.chip),
      onTap: () => _open(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: done ? AppColors.accent : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadii.chip),
          border: Border.all(color: done ? AppColors.brand : AppColors.line),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              done ? Icons.check_circle : Icons.camera_alt_outlined,
              size: 16,
              color: done ? AppColors.brandDark : AppColors.muted,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: done ? AppColors.brandDark : AppColors.muted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
