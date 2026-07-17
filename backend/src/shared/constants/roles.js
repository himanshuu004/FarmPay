/**
 * User Roles
 * Defines all roles used across the FarmerPay platform.
 */

const ROLES = {
  // Core farmer roles
  FARMER: 'farmer',
  FPO_ADMIN: 'fpo_admin',
  FPO_MEMBER: 'fpo_member',

  // Trust layer
  TRUST_ADMIN: 'trust_admin',
  TRUST_OFFICER: 'trust_officer',

  // DICE (Data, Intelligence, Compliance, Economics)
  DICE_ADMIN: 'dice_admin',
  DICE_ANALYST: 'dice_analyst',

  // Roots (vertical heads)
  CROP_MANAGER: 'crop_manager',
  DAIRY_MANAGER: 'dairy_manager',
  FISHERY_MANAGER: 'fishery_manager',

  // Support modules
  SAGE_ADVISOR: 'sage_advisor',         // AI advisory
  PULSE_OPERATOR: 'pulse_operator',     // Market intelligence
  SENTINEL_OFFICER: 'sentinel_officer', // Risk & compliance
  SATHI_AGENT: 'sathi_agent',           // Field agent
  VYAPAR_MANAGER: 'vyapar_manager',     // Commerce manager

  // System
  SYSTEM_ADMIN: 'system_admin',
  SUPER_ADMIN: 'super_admin',

  // Allied KCC platform + CIA roles.
  // NOTE: role VALUES here are UPPERCASE to match Role.role_name in the DB,
  // which is what flows into the JWT `role` claim and is compared by roleCheck
  // (e.g. the claims field router uses roleCheck('SURVEYOR','VET')). The older
  // lowercase entries above predate this and are not used by roleCheck.
  VET: 'VET',
  SURVEYOR: 'SURVEYOR',
  POSP: 'POSP',
  INSURER_OPS: 'INSURER_OPS',
  GOV_VIEWER: 'GOV_VIEWER',
  GP_BDO: 'GP_BDO',
  BANKER: 'BANKER',

  // CIA — Cattle Induction Application (in-app, scoped; maker-checker + SoD).
  // The DCS/supervisor roles are the CIA-only exception to the ERP-only
  // co-op-approval rule (CLAUDE.md Convention 30).
  DCS_SECRETARY: 'DCS_SECRETARY',
  DCS_BOARD: 'DCS_BOARD',
  ROUTE_SUPERVISOR: 'ROUTE_SUPERVISOR',
  DUSS_MAKER: 'DUSS_MAKER',
  DUSS_CHECKER: 'DUSS_CHECKER',
  DISTRICT_OFFICER: 'DISTRICT_OFFICER',
  BANK_MAKER: 'BANK_MAKER',
  BANK_CHECKER: 'BANK_CHECKER',
  BANK_REGIONAL: 'BANK_REGIONAL',
  SELLER: 'SELLER',
  TRANSPORTER: 'TRANSPORTER',
  UCDF_PM: 'UCDF_PM',
  UCDF_FINANCE: 'UCDF_FINANCE',
  UCDF_ADMIN: 'UCDF_ADMIN',
  AUDITOR: 'AUDITOR',
};

/**
 * Group roles by access level for convenience in authorization checks.
 */
const ROLE_GROUPS = {
  ADMIN_ROLES: [ROLES.SYSTEM_ADMIN, ROLES.SUPER_ADMIN],
  TRUST_ROLES: [ROLES.TRUST_ADMIN, ROLES.TRUST_OFFICER],
  DICE_ROLES: [ROLES.DICE_ADMIN, ROLES.DICE_ANALYST],
  FPO_ROLES: [ROLES.FPO_ADMIN, ROLES.FPO_MEMBER],
  ROOTS_ROLES: [ROLES.CROP_MANAGER, ROLES.DAIRY_MANAGER, ROLES.FISHERY_MANAGER],
  // CIA maker-checker groupings (segregation of duties enforced at the route).
  CIA_DCS_ROLES: [ROLES.DCS_SECRETARY, ROLES.DCS_BOARD],
  CIA_FIELD_ROLES: [ROLES.ROUTE_SUPERVISOR, ROLES.VET], // share ONE CIA field PWA, role-gated
  CIA_DUSS_ROLES: [ROLES.DUSS_MAKER, ROLES.DUSS_CHECKER, ROLES.DISTRICT_OFFICER],
  CIA_BANK_ROLES: [ROLES.BANK_MAKER, ROLES.BANK_CHECKER, ROLES.BANK_REGIONAL],
  CIA_UCDF_ROLES: [ROLES.UCDF_PM, ROLES.UCDF_FINANCE, ROLES.UCDF_ADMIN, ROLES.AUDITOR, ROLES.GOV_VIEWER],
};

module.exports = { ROLES, ROLE_GROUPS };
