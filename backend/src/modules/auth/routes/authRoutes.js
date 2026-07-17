/**
 * Auth Routes
 * Defines all authentication API endpoints with validation and rate limiting.
 *
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user management
 */

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const { createLimiter } = require('../../../middleware/rateLimiter');
const {
  registerSchema,
  sendOtpSchema,
  verifyOtpSchema,
  setMpinSchema,
  loginSchema,
  refreshTokenSchema,
  forgotMpinSchema,
  changeMpinSchema,
} = require('../validators/authValidator');

// ─── Rate Limiters ─────────────────────────────────────────────────

// DEV: Relaxed rate limits for testing (tighten for production)
const isDev = process.env.NODE_ENV !== 'production';

/** Registration: 3 per hour per IP (100 in dev) */
const registerLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: isDev ? 100 : 3 });

/** OTP: 3 per 10 minutes per IP (100 in dev) */
const otpLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: isDev ? 100 : 3 });

/** Login: 10 per 15 minutes per IP (100 in dev) */
const loginLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: isDev ? 100 : 10 });

/** OTP verify: 5 per 10 minutes per IP (100 in dev) */
const otpVerifyLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: isDev ? 100 : 5 });

/** Password reset: 3 per hour per IP (100 in dev) */
const resetLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: isDev ? 100 : 3 });

// ─── Public Routes ─────────────────────────────────────────────────

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, mobile]
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               mobile:
 *                 type: string
 *                 example: "9876543210"
 *               email:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *     responses:
 *       201:
 *         description: Registration successful, OTP sent
 *       409:
 *         description: User already exists
 */
router.post('/register', registerLimiter, validate(registerSchema), authController.register);

/**
 * @swagger
 * /auth/send-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Send OTP to mobile or email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mobile:
 *                 type: string
 *               email:
 *                 type: string
 *               purpose:
 *                 type: string
 *                 enum: [register, login, reset_mpin, update_contact]
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
router.post('/send-otp', otpLimiter, validate(sendOtpSchema), authController.sendOtp);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify an OTP code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otpRequestId, otpCode]
 *             properties:
 *               otpRequestId:
 *                 type: string
 *                 format: uuid
 *               otpCode:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: OTP verified successfully
 */
router.post('/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), authController.verifyOtp);

/**
 * @swagger
 * /auth/set-mpin:
 *   post:
 *     tags: [Auth]
 *     summary: Set or reset 4-digit MPIN (requires recently-verified OTP)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile, otpRequestId, mpin]
 *             properties:
 *               mobile: { type: string, example: "9876543210" }
 *               otpRequestId: { type: string, format: uuid }
 *               mpin: { type: string, example: "4826" }
 *     responses:
 *       200: { description: MPIN set successfully }
 */
router.post('/set-mpin', resetLimiter, validate(setMpinSchema), authController.setMpin);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with mobile + 4-digit MPIN
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile, mpin]
 *             properties:
 *               mobile:
 *                 type: string
 *                 example: "9876543210"
 *               mpin:
 *                 type: string
 *                 example: "4826"
 *               deviceInfo:
 *                 type: string
 *               deviceUuid:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked
 */
router.post('/login', loginLimiter, validate(loginSchema), authController.login);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);

/**
 * @swagger
 * /auth/forgot-mpin:
 *   post:
 *     tags: [Auth]
 *     summary: Request an OTP to reset a forgotten MPIN
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mobile]
 *             properties:
 *               mobile:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent if account exists. Client then verifies OTP and calls /auth/set-mpin.
 */
router.post('/forgot-mpin', resetLimiter, validate(forgotMpinSchema), authController.forgotMpin);

// ─── Protected Routes ──────────────────────────────────────────────

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout current session
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /auth/change-mpin:
 *   post:
 *     tags: [Auth]
 *     summary: Change MPIN (logged-in user)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentMpin, newMpin]
 *             properties:
 *               currentMpin: { type: string, example: "4826" }
 *               newMpin: { type: string, example: "7391" }
 *     responses:
 *       200: { description: MPIN changed successfully }
 *       401: { description: Current MPIN incorrect }
 */
router.post('/change-mpin', authenticate, resetLimiter, validate(changeMpinSchema), authController.changeMpin);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile with roles and permissions
 */
router.get('/me', authenticate, authController.getMe);

// ─── Tier-2: Aadhaar Step-Up Authentication ────────────────────────
const aadhaarOtpLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 3 });
const aadhaarVerifyLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 5 });

/**
 * @swagger
 * /auth/aadhaar/send-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Send Aadhaar OTP for DICE step-up authentication (Tier-2)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [aadhaar]
 *             properties:
 *               aadhaar: { type: string, example: "234567890123" }
 *     responses:
 *       200: { description: OTP sent successfully }
 */
router.post('/aadhaar/send-otp', authenticate, aadhaarOtpLimiter, authController.sendAadhaarOtp);

/**
 * @swagger
 * /auth/aadhaar/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify Aadhaar OTP and issue step-up token (15 min TTL)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otpRequestId, otpCode]
 *             properties:
 *               otpRequestId: { type: string }
 *               otpCode: { type: string, example: "123456" }
 *     responses:
 *       200: { description: Step-up token issued }
 */
router.post('/aadhaar/verify-otp', authenticate, aadhaarVerifyLimiter, authController.verifyAadhaarOtp);

/**
 * @swagger
 * /auth/aadhaar/status:
 *   get:
 *     tags: [Auth]
 *     summary: Check current Aadhaar step-up session status
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Step-up status }
 */
router.get('/aadhaar/status', authenticate, authController.getAadhaarStatus);

module.exports = router;
