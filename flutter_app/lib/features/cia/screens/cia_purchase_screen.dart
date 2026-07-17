import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/api/api_client.dart';
import '../../../design_system/tokens.dart';
import '../../../design_system/widgets/capture_photo_field.dart';
import '../../../design_system/widgets/captured_evidence.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../providers/cia_providers.dart';

enum _Panel { none, seller, inspect, geo, eartag, transport }

/// CIA — guided cattle purchase. After disbursement the farmer documents
/// the animal step by step: seller → inspection → live GPS → 12-digit ear
/// tag → transport, then submits one capture (→ PURCHASE_INITIATED). The
/// post-capture phase (vet approval → transit insurance → arrival → cattle
/// insurance → payment gate) is driven by the fine-grained purchase
/// sub-status. Payment is NEVER farmer-authored.
///
/// Mirrors app/app/cia-purchase.tsx; evidence refs are real uploaded URLs
/// from POST .../evidence (Convention 9/32: live-capture only, real
/// SHA-256), not RN's client-side asset URIs.
class CiaPurchaseScreen extends ConsumerStatefulWidget {
  const CiaPurchaseScreen({super.key, this.appUuid});

  final String? appUuid;

  @override
  ConsumerState<CiaPurchaseScreen> createState() => _CiaPurchaseScreenState();
}

class _CiaPurchaseScreenState extends ConsumerState<CiaPurchaseScreen> {
  bool _loading = true;
  bool _err = false;
  String? _uuid;
  Map? _state;
  bool _busy = false;
  _Panel _panel = _Panel.none;

  // capture draft (local until the single submit)
  final _sellerName = TextEditingController();
  final _sellerBank = TextEditingController();
  final _sellerRel = TextEditingController();
  CapturedEvidence? _sellerIdPhoto;
  CapturedEvidence? _sellerPhoto;

  final List<CapturedEvidence> _animalPhotos = [];
  String _species = '';
  final _breed = TextEditingController();
  String _sex = 'FEMALE';

  ({double lat, double lng, double? acc})? _geo;
  bool _locating = false;

  final _earTag = TextEditingController();
  CapturedEvidence? _earTagPhoto;

  final _vehicleReg = TextEditingController();
  final _driverName = TextEditingController();
  CapturedEvidence? _billPhoto;
  CapturedEvidence? _challanPhoto;

  static final _tagRe = RegExp(r'^\d{12}$');

  @override
  void dispose() {
    _sellerName.dispose();
    _sellerBank.dispose();
    _sellerRel.dispose();
    _breed.dispose();
    _earTag.dispose();
    _vehicleReg.dispose();
    _driverName.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _err = false;
    });
    try {
      final api = ref.read(ciaApiProvider);
      var uuid = widget.appUuid;
      if (uuid == null) {
        final appsRes = await api.myApplications();
        final apps = appsRes['success'] == true ? List<Map>.from(appsRes['data'] ?? []) : <Map>[];
        if (apps.isEmpty) {
          setState(() => _err = true);
          return;
        }
        uuid = apps.first['applicationUuid'].toString();
      }
      _uuid = uuid;
      final res = await api.getPurchaseState(uuid);
      if (res['success'] == true) {
        setState(() => _state = Map.from(res['data']));
      } else {
        setState(() => _err = true);
      }
    } catch (_) {
      setState(() => _err = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _sellerDone =>
      _sellerName.text.trim().isNotEmpty &&
      _sellerIdPhoto != null &&
      _sellerBank.text.trim().isNotEmpty &&
      _sellerPhoto != null &&
      _sellerRel.text.trim().isNotEmpty;
  bool get _inspectDone => _animalPhotos.isNotEmpty && _species.isNotEmpty && _breed.text.trim().isNotEmpty;
  bool get _geoDone => _geo != null;
  bool get _eartagDone => _tagRe.hasMatch(_earTag.text) && _earTagPhoto != null;
  bool get _canSubmit => _sellerDone && _inspectDone && _geoDone && _eartagDone;

  Future<void> _getLocation() async {
    final l10n = AppLocalizations.of(context);
    final perm = await Permission.location.request();
    if (!perm.isGranted) {
      _showSnack(l10n.ciaPurLocationDenied, error: true);
      return;
    }
    setState(() => _locating = true);
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 10)),
      );
      setState(() => _geo = (lat: pos.latitude, lng: pos.longitude, acc: pos.accuracy));
    } catch (_) {
      _showSnack(l10n.ciaLoadError, error: true);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  /// Uploads real captured bytes → the URL used as the ref field.
  Future<String?> _upload(CapturedEvidence e) async {
    final uuid = _uuid;
    if (uuid == null) return null;
    final res = await ref.read(ciaApiProvider).uploadEvidence(uuid, e);
    if (res['success'] != true) return null;
    return res['data']['url'].toString();
  }

  Future<void> _submitCapture() async {
    final uuid = _uuid;
    if (uuid == null || !_canSubmit) return;
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final sellerIdRef = await _upload(_sellerIdPhoto!);
      final sellerPhotoRef = await _upload(_sellerPhoto!);
      final earTagPhotoRef = await _upload(_earTagPhoto!);
      final photoRefs = <String>[];
      for (final p in _animalPhotos) {
        final r = await _upload(p);
        if (r != null) photoRefs.add(r);
      }
      String? billRef;
      String? challanRef;
      final hasTransport = _vehicleReg.text.trim().isNotEmpty &&
          _driverName.text.trim().isNotEmpty &&
          _billPhoto != null &&
          _challanPhoto != null;
      if (hasTransport) {
        billRef = await _upload(_billPhoto!);
        challanRef = await _upload(_challanPhoto!);
      }
      if (sellerIdRef == null || sellerPhotoRef == null || earTagPhotoRef == null || photoRefs.isEmpty) {
        _showSnack(l10n.ciaLoadError, error: true);
        return;
      }
      final body = {
        'earTagNo': _earTag.text,
        'earTagPhotoRef': earTagPhotoRef,
        'species': _species,
        'breed': _breed.text.trim(),
        'sex': _sex,
        'purchaseGeo': {'lat': _geo!.lat, 'lng': _geo!.lng},
        'photoRefs': photoRefs,
        'seller': {
          'name': _sellerName.text.trim(),
          'idProofRef': sellerIdRef,
          'bankAccount': _sellerBank.text.trim(),
          'photoRef': sellerPhotoRef,
          'relationshipToBuyer': _sellerRel.text.trim(),
        },
        if (hasTransport)
          'transport': {
            'vehicleRegNo': _vehicleReg.text.trim(),
            'driverName': _driverName.text.trim(),
            'billRef': billRef,
            'challanRef': challanRef,
          },
      };
      final res = await ref.read(ciaApiProvider).capturePurchase(uuid, body);
      if (res['success'] == true) {
        setState(() => _panel = _Panel.none);
        await _load();
      } else if (res['errorCode'] == 'CIA_EARTAG_DUPLICATE') {
        _showSnack(l10n.ciaPurTagDup, error: true);
      } else {
        _showSnack((res['message'] ?? l10n.ciaLoadError).toString(), error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _doTransit() async {
    final uuid = _uuid;
    if (uuid == null) return;
    setState(() => _busy = true);
    try {
      final sum = (_state?['animal']?['approvedPurchasePrice'] as num?);
      final res = await ref.read(ciaApiProvider).issueTransit(uuid, sumInsured: sum);
      if (res['success'] == true) {
        await _load();
      } else if (mounted) {
        _showSnack((res['message'] ?? AppLocalizations.of(context).ciaLoadError).toString(), error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _doArrival() async {
    final uuid = _uuid;
    if (uuid == null) return;
    setState(() => _busy = true);
    try {
      final res = await ref.read(ciaApiProvider).confirmArrival(uuid);
      if (res['success'] == true) {
        await _load();
      } else if (mounted) {
        _showSnack((res['message'] ?? AppLocalizations.of(context).ciaLoadError).toString(), error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _doCattle() async {
    final uuid = _uuid;
    final deliveredAt = _state?['deliveredAt'];
    if (uuid == null || deliveredAt == null) return;
    setState(() => _busy = true);
    try {
      final effectiveDate = deliveredAt.toString().substring(0, 10);
      final sum = (_state?['animal']?['approvedPurchasePrice'] as num?);
      final res = await ref.read(ciaApiProvider).issueCattle(uuid, effectiveDate: effectiveDate, sumInsured: sum);
      if (res['success'] == true) {
        await _load();
      } else if (res['errorCode'] == 'CIA_INSURANCE_BACKDATED') {
        _showSnack(AppLocalizations.of(context).ciaPurBackdated, error: true);
      } else if (mounted) {
        _showSnack((res['message'] ?? AppLocalizations.of(context).ciaLoadError).toString(), error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showSnack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? AppColors.danger : null));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.ciaNavPurchase)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _err || _state == null
          ? _errorView(l10n)
          : _panel != _Panel.none && _state!['purchasable'] == true
          ? _panelBody(l10n)
          : _hubBody(l10n, _state!),
    );
  }

  Widget _errorView(AppLocalizations l10n) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(l10n.ciaLoadError, style: const TextStyle(color: AppColors.muted)),
        const SizedBox(height: 12),
        ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
      ],
    ),
  );

  Widget _hubBody(AppLocalizations l10n, Map state) {
    final loan = state['loan'];
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.line)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text.rich(TextSpan(children: [
                TextSpan(text: loan != null ? formatRupees(loan['amount']) : '—', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.brandDark)),
                TextSpan(text: '  ${l10n.ciaPurDisbursed}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted)),
              ])),
              const SizedBox(height: 3),
              Text(l10n.ciaPurBuyOne, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
            ],
          ),
        ),
        if (state['purchasable'] == true) ...[
          _stepRow(1, l10n.ciaPurSSeller, l10n.ciaPurSSellerSub, _sellerDone, () => setState(() => _panel = _Panel.seller), l10n),
          _stepRow(2, l10n.ciaPurSInspect, l10n.ciaPurSInspectSub, _inspectDone, () => setState(() => _panel = _Panel.inspect), l10n),
          _stepRow(3, l10n.ciaPurSGeo, l10n.ciaPurSGeoSub, _geoDone, () => setState(() => _panel = _Panel.geo), l10n),
          _stepRow(4, l10n.ciaPurSEartag, l10n.ciaPurSEartagSub, _eartagDone, () => setState(() => _panel = _Panel.eartag), l10n),
          _stepRow(5, l10n.ciaPurSTransport, l10n.ciaPurSTransportSub, false, () => setState(() => _panel = _Panel.transport), l10n, optional: true),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _canSubmit && !_busy ? _submitCapture : null,
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(l10n.ciaPurSubmitCapture),
            ),
          ),
          if (!_canSubmit)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(l10n.ciaPurSubmitHint, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
            ),
        ] else if (state['captured'] != true)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.line)),
            child: Text(l10n.ciaPurNotReady, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, height: 1.4)),
          )
        else
          _postCapture(l10n, state),
        Container(
          padding: const EdgeInsets.all(12),
          margin: const EdgeInsets.only(top: 16),
          decoration: BoxDecoration(color: AppColors.warnAmberBg, borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFF3E2C8))),
          child: Text('🔒 ${l10n.ciaPurGateLock}', style: const TextStyle(color: AppColors.warnAmber, fontSize: 12.5, height: 1.4)),
        ),
      ],
    );
  }

  Widget _postCapture(AppLocalizations l10n, Map state) {
    final ps = state['purchaseStatus'];
    final sum = state['animal']?['approvedPurchasePrice'];
    if (ps == 'PURCHASE_INITIATED' || ps == 'VET_VERIFICATION_PENDING') {
      return _actionCard(title: l10n.ciaPurVetPending, sub: l10n.ciaPurVetPendingSub, locked: true);
    }
    if (ps == 'PURCHASE_APPROVED') {
      return _actionCard(
        title: l10n.ciaPurTransitTitle,
        sub: l10n.ciaPurTransitSub,
        extra: sum != null ? '${l10n.ciaPurSumInsured}: ${formatRupees(sum)}' : null,
        cta: l10n.ciaPurIssueTransit,
        onPressed: _doTransit,
      );
    }
    if (ps == 'TRANSIT_IN_PROGRESS') {
      return _actionCard(title: l10n.ciaPurArrivalTitle, sub: l10n.ciaPurArrivalSub, cta: l10n.ciaPurConfirmArrival, onPressed: _doArrival);
    }
    if (ps == 'CATTLE_DELIVERED') {
      final eff = state['deliveredAt'] != null ? state['deliveredAt'].toString().substring(0, 10) : '';
      return _actionCard(
        title: l10n.ciaPurCattleTitle,
        sub: l10n.ciaPurCattleSub,
        extra: '${l10n.ciaPurEffectiveDate}: $eff',
        cta: l10n.ciaPurIssueCattle,
        onPressed: _doCattle,
      );
    }
    if (ps == 'INSURANCE_PENDING' || ps == 'SELLER_PAYMENT_PENDING') {
      return _actionCard(
        title: l10n.ciaPurGatePending,
        sub: l10n.ciaPurGatePendingSub,
        extra: state['cattlePolicyNo'] != null ? '${l10n.ciaPurPolicyNo}: ${state['cattlePolicyNo']}' : null,
        locked: true,
      );
    }
    if (ps == 'SELLER_PAID') {
      return _actionCard(title: l10n.ciaPurPaidTitle, sub: l10n.ciaPurPaidSub, done: true);
    }
    return _actionCard(title: l10n.ciaPurVetPending, sub: l10n.ciaPurVetPendingSub, locked: true);
  }

  Widget _actionCard({
    required String title,
    required String sub,
    String? extra,
    String? cta,
    VoidCallback? onPressed,
    bool locked = false,
    bool done = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: done ? const Color(0xFFF2FBF5) : (locked ? const Color(0xFFF7F8F7) : AppColors.card),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: done ? const Color(0xFFBFE3CF) : AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(done ? '✅' : (locked ? '🔒' : '→'), style: const TextStyle(fontSize: 22)),
          const SizedBox(height: 4),
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink)),
          const SizedBox(height: 4),
          Text(sub, style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.35)),
          if (extra != null) ...[
            const SizedBox(height: 8),
            Text(extra, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.brandDark)),
          ],
          if (cta != null && onPressed != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _busy ? null : onPressed,
                child: _busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(cta),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _stepRow(int n, String title, String sub, bool done, VoidCallback onTap, AppLocalizations l10n, {bool optional = false}) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: done ? const Color(0xFFF2FBF5) : AppColors.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: done ? const Color(0xFFBFE3CF) : AppColors.line),
        ),
        child: Row(
          children: [
            Container(
              width: 26,
              height: 26,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done ? AppColors.brand : Colors.transparent,
                border: Border.all(color: AppColors.brand, width: 2),
              ),
              child: Text(
                done ? '✓' : '$n',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: done ? Colors.white : AppColors.brandDark),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(TextSpan(children: [
                    TextSpan(text: title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: AppColors.ink)),
                    if (optional) TextSpan(text: '  ·  ${l10n.ciaAppOptional}', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                  ])),
                  Text(sub, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
                ],
              ),
            ),
            Text(done ? l10n.ciaPurEdit : l10n.ciaPurOpen, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.brandDark)),
          ],
        ),
      ),
    );
  }

  Widget _panelBody(AppLocalizations l10n) {
    Widget content;
    switch (_panel) {
      case _Panel.seller:
        content = _sellerPanel(l10n);
        break;
      case _Panel.inspect:
        content = _inspectPanel(l10n);
        break;
      case _Panel.geo:
        content = _geoPanel(l10n);
        break;
      case _Panel.eartag:
        content = _eartagPanel(l10n);
        break;
      case _Panel.transport:
        content = _transportPanel(l10n);
        break;
      case _Panel.none:
        content = const SizedBox.shrink();
    }
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(color: AppColors.blueBg, borderRadius: BorderRadius.circular(8)),
          child: Text(
            '📷 ${l10n.ciaPurLiveOnly}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11.5, color: AppColors.blue, fontWeight: FontWeight.w600),
          ),
        ),
        content,
        TextButton(
          onPressed: () => setState(() => _panel = _Panel.none),
          child: Text('← ${l10n.commonBack}'),
        ),
      ],
    );
  }

  Widget _panelDone(AppLocalizations l10n, bool disabled) => Padding(
    padding: const EdgeInsets.only(top: 18),
    child: SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: disabled ? null : () => setState(() => _panel = _Panel.none),
        child: Text(l10n.ciaPurSaveStep),
      ),
    ),
  );

  Widget _sellerPanel(AppLocalizations l10n) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(l10n.ciaPurSellerName, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      TextField(controller: _sellerName, onChanged: (_) => setState(() {})),
      const SizedBox(height: 12),
      Text(l10n.ciaPurSellerBank, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      TextField(controller: _sellerBank, decoration: InputDecoration(hintText: l10n.ciaPurSellerBankPh), onChanged: (_) => setState(() {})),
      const SizedBox(height: 12),
      Text(l10n.ciaPurSellerRel, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      TextField(controller: _sellerRel, decoration: InputDecoration(hintText: l10n.ciaPurSellerRelPh), onChanged: (_) => setState(() {})),
      const SizedBox(height: 12),
      _photoFieldRow(l10n.ciaPurSellerId, _sellerIdPhoto, (e) => setState(() => _sellerIdPhoto = e)),
      _photoFieldRow(l10n.ciaPurSellerPhoto, _sellerPhoto, (e) => setState(() => _sellerPhoto = e)),
      _panelDone(l10n, !_sellerDone),
    ],
  );

  Widget _inspectPanel(AppLocalizations l10n) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(l10n.ciaPurAnimalPhotos, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (int i = 0; i < _animalPhotos.length; i++)
            Container(
              width: 56,
              height: 56,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: const Color(0xFF0B120E), borderRadius: BorderRadius.circular(10)),
              child: Text('📷 ${i + 1}', style: const TextStyle(color: Color(0xFF7FD0A3), fontSize: 11, fontWeight: FontWeight.w700)),
            ),
          CapturePhotoField(
            label: l10n.ciaPurAddPhoto,
            captured: null,
            onCaptured: (e) => setState(() => _animalPhotos.add(e)),
          ),
        ],
      ),
      const SizedBox(height: 6),
      Text('${_animalPhotos.length} ${l10n.ciaPurPhotosCount}', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
      const SizedBox(height: 10),
      Text(l10n.ciaPurSpecies, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      Row(children: [
        Expanded(child: _chip(l10n.ciaPurCow, _species == 'CATTLE', () => setState(() => _species = 'CATTLE'))),
        const SizedBox(width: 8),
        Expanded(child: _chip(l10n.ciaPurBuffalo, _species == 'BUFFALO', () => setState(() => _species = 'BUFFALO'))),
      ]),
      const SizedBox(height: 12),
      Text(l10n.ciaPurBreed, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      TextField(controller: _breed, decoration: InputDecoration(hintText: l10n.ciaAppBreedPh), onChanged: (_) => setState(() {})),
      const SizedBox(height: 12),
      Text(l10n.ciaPurSex, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      Row(children: [
        Expanded(child: _chip(l10n.ciaPurFemale, _sex == 'FEMALE', () => setState(() => _sex = 'FEMALE'))),
        const SizedBox(width: 8),
        Expanded(child: _chip(l10n.ciaPurMale, _sex == 'MALE', () => setState(() => _sex = 'MALE'))),
      ]),
      _panelDone(l10n, !_inspectDone),
    ],
  );

  Widget _geoPanel(AppLocalizations l10n) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: const Color(0xFF0B120E), borderRadius: BorderRadius.circular(14)),
        alignment: Alignment.center,
        child: _geo != null
            ? Column(children: [
                Text('✓ ${l10n.ciaPurLocationOk}', style: const TextStyle(color: Color(0xFF7FD0A3), fontSize: 14, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(
                  '${_geo!.lat.toStringAsFixed(4)}, ${_geo!.lng.toStringAsFixed(4)}${_geo!.acc != null ? ' · ${l10n.ciaPurAccuracy} ${_geo!.acc!.round()}m' : ''}',
                  style: const TextStyle(color: Color(0xFFCCFFEE), fontSize: 12.5, fontFamily: 'monospace'),
                ),
              ])
            : Text(_locating ? l10n.ciaPurLocating : l10n.ciaPurSGeoSub, style: const TextStyle(color: Color(0xFF7FD0A3), fontSize: 13)),
      ),
      const SizedBox(height: 10),
      Text(l10n.ciaPurGeofenceNote, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
      const SizedBox(height: 10),
      SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: _locating ? null : _getLocation,
          child: _locating
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : Text('📍 ${l10n.ciaPurCaptureLocation}'),
        ),
      ),
      _panelDone(l10n, !_geoDone),
    ],
  );

  Widget _eartagPanel(AppLocalizations l10n) {
    final valid = _tagRe.hasMatch(_earTag.text);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l10n.ciaPurEartagLabel, style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        TextField(
          controller: _earTag,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: '123456789012'),
          onChanged: (v) {
            final digits = v.replaceAll(RegExp(r'\D'), '');
            final capped = digits.length > 12 ? digits.substring(0, 12) : digits;
            if (capped != v) {
              _earTag.value = TextEditingValue(text: capped, selection: TextSelection.collapsed(offset: capped.length));
            }
            setState(() {});
          },
        ),
        const SizedBox(height: 6),
        Text(
          valid ? '✓ ${l10n.ciaPurTagValid}' : '${_earTag.text.length}/12 ${l10n.ciaPurTagNeed}',
          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: valid ? AppColors.brandDark : AppColors.danger),
        ),
        const SizedBox(height: 12),
        _photoFieldRow(l10n.ciaPurEartagPhoto, _earTagPhoto, (e) => setState(() => _earTagPhoto = e)),
        _panelDone(l10n, !_eartagDone),
      ],
    );
  }

  Widget _transportPanel(AppLocalizations l10n) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(l10n.ciaPurVehicle, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      TextField(controller: _vehicleReg, decoration: const InputDecoration(hintText: 'UK07AB1234'), onChanged: (_) => setState(() {})),
      const SizedBox(height: 12),
      Text(l10n.ciaPurDriver, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      TextField(controller: _driverName, onChanged: (_) => setState(() {})),
      const SizedBox(height: 12),
      _photoFieldRow(l10n.ciaPurBill, _billPhoto, (e) => setState(() => _billPhoto = e)),
      _photoFieldRow(l10n.ciaPurChallan, _challanPhoto, (e) => setState(() => _challanPhoto = e)),
      _panelDone(l10n, false),
    ],
  );

  Widget _photoFieldRow(String label, CapturedEvidence? value, ValueChanged<CapturedEvidence> onCaptured) => Container(
    padding: const EdgeInsets.all(11),
    margin: const EdgeInsets.only(bottom: 8),
    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.line)),
    child: Row(
      children: [
        Expanded(
          child: Text('${value != null ? '✅ ' : ''}$label', style: const TextStyle(fontSize: 13.5, color: AppColors.ink)),
        ),
        CapturePhotoField(label: label, captured: value, onCaptured: onCaptured),
      ],
    ),
  );

  Widget _chip(String label, bool on, VoidCallback onTap) => InkWell(
    borderRadius: BorderRadius.circular(10),
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: on ? AppColors.brand : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: on ? AppColors.brand : AppColors.line),
      ),
      child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: on ? Colors.white : AppColors.brandDark)),
    ),
  );
}
