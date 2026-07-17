import 'dart:io';

import 'package:camera/camera.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import '../tokens.dart';
import 'captured_evidence.dart';

/// Live-capture-only camera screen — the shared implementation behind
/// [CapturePhotoField]. Convention 9/25/32: cattle/ear-tag/geo/claim
/// evidence must be camera-only (no gallery picker exists anywhere in this
/// screen), content-addressed via a real SHA-256 over the captured bytes,
/// and EXIF/GPS preserved. On-device capture QC (blur/exposure) is left to
/// a later AI phase — this screen only guarantees the capture is live and
/// the hash is real, which is the correctness-critical part for backend
/// evidence validation.
class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({super.key, required this.title});

  final String title;

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen> {
  CameraController? _controller;
  Future<void>? _initFuture;
  String? _error;
  bool _capturing = false;

  @override
  void initState() {
    super.initState();
    _initFuture = _init();
  }

  Future<void> _init() async {
    final camStatus = await Permission.camera.request();
    if (!camStatus.isGranted) {
      setState(() => _error = 'camera_denied');
      return;
    }
    final cameras = await availableCameras();
    if (cameras.isEmpty) {
      setState(() => _error = 'no_camera');
      return;
    }
    final back = cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.back,
      orElse: () => cameras.first,
    );
    final controller = CameraController(
      back,
      ResolutionPreset.high,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );
    await controller.initialize();
    if (!mounted) {
      await controller.dispose();
      return;
    }
    setState(() => _controller = controller);
  }

  Future<Position?> _bestEffortLocation() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        return null;
      }
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      );
    } catch (_) {
      // Evidence integrity never depends on GPS being available — a photo
      // without a fix is still a valid live capture.
      return null;
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || _capturing) return;
    setState(() => _capturing = true);
    try {
      final file = await controller.takePicture();
      final bytes = await File(file.path).readAsBytes();
      final hash = sha256.convert(bytes).toString();
      final position = await _bestEffortLocation();
      if (!mounted) return;
      Navigator.of(context).pop(
        CapturedEvidence(
          bytes: bytes,
          contentHash: hash,
          capturedAt: DateTime.now(),
          gpsLat: position?.latitude,
          gpsLng: position?.longitude,
        ),
      );
    } catch (_) {
      if (mounted) setState(() => _capturing = false);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.title),
      ),
      body: FutureBuilder<void>(
        future: _initFuture,
        builder: (context, snapshot) {
          if (_error != null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _error == 'camera_denied'
                      ? 'Camera permission is required to capture live evidence.'
                      : 'No camera available on this device.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            );
          }
          final controller = _controller;
          if (snapshot.connectionState != ConnectionState.done || controller == null) {
            return const Center(child: CircularProgressIndicator(color: Colors.white));
          }
          return Stack(
            fit: StackFit.expand,
            children: [
              CameraPreview(controller),
              Positioned(
                left: 0,
                right: 0,
                bottom: 32,
                child: Center(
                  child: GestureDetector(
                    onTap: _capturing ? null : _capture,
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        border: Border.all(color: AppColors.brand, width: 4),
                      ),
                      alignment: Alignment.center,
                      child: _capturing
                          ? const SizedBox(
                              width: 28,
                              height: 28,
                              child: CircularProgressIndicator(strokeWidth: 3),
                            )
                          : const Icon(Icons.camera_alt, color: AppColors.brandDark, size: 30),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
