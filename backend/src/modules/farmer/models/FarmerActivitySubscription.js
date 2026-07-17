/**
 * FarmerActivitySubscription Model
 *
 * Canonical operational source-of-truth for which livelihood activities a
 * farmer participates in, with full lifecycle (ACTIVE / PAUSED / DROPPED),
 * auto-derived tier (SMALL / MEDIUM / LARGE), and the latest health snapshot.
 *
 * One row per (farmer, activity_code). Status transitions happen in place
 * — DROPPED rows are preserved (TRUST and DICE care about exits).
 *
 * Drives:
 *   • ROOTS sub-module visibility on the farmer mobile app
 *   • DICE underwriting income mix
 *   • Home dashboard ordering (priority_rank ASC)
 *   • Persona classification (single / double / triple / quad income)
 */

const { Model } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

const ACTIVITY_CODES = [
  'CROP',
  'DAIRY',
  'FISHERY',
  'HORTI',
  'POULTRY',
  'GOATERY',
  'LABOUR_WAGE',
  'SHOP_BUSINESS',
  'REMITTANCE',
  'OTHER',
];

const STATUSES = ['ACTIVE', 'PAUSED', 'DROPPED'];
const TIERS = ['SMALL', 'MEDIUM', 'LARGE'];
const HEALTH_STATUSES = ['GREEN', 'AMBER', 'RED', 'UNKNOWN'];
const SOURCES = ['FARMER_DECLARED', 'AGENT_VERIFIED', 'BACKFILL', 'SYSTEM_INFERRED'];

module.exports = (sequelize, DataTypes) => {
  class FarmerActivitySubscription extends Model {
    static associate(models) {
      FarmerActivitySubscription.belongsTo(models.User, {
        foreignKey: 'farmer_id',
        as: 'farmer',
      });
    }

    /** Convenience: is this row currently live? */
    isLive() {
      return this.status === 'ACTIVE';
    }

    /** Mark this subscription as DROPPED, preserving history. */
    async drop(reason) {
      this.status = 'DROPPED';
      this.dropped_at = new Date();
      if (reason) this.dropped_reason = reason;
      return this.save();
    }

    /** Refresh the health snapshot (called by ROOTS / DICE jobs). */
    async refreshHealth(status) {
      this.last_health_status = status;
      this.last_snapshot_at = new Date();
      return this.save();
    }
  }

  FarmerActivitySubscription.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

      subscription_uuid: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true,
        defaultValue: () => uuidv4(),
      },

      farmer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },

      activity_code: {
        type: DataTypes.ENUM(...ACTIVITY_CODES),
        allowNull: false,
      },

      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },

      subscribed_at: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      auto_derived_tier: {
        type: DataTypes.ENUM(...TIERS),
        allowNull: true,
      },

      last_health_status: {
        type: DataTypes.ENUM(...HEALTH_STATUSES),
        allowNull: false,
        defaultValue: 'UNKNOWN',
      },

      last_snapshot_at: { type: DataTypes.DATE, allowNull: true },

      priority_rank: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 99,
      },

      dropped_at: { type: DataTypes.DATEONLY, allowNull: true },
      dropped_reason: { type: DataTypes.TEXT, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },

      source: {
        type: DataTypes.ENUM(...SOURCES),
        allowNull: false,
        defaultValue: 'FARMER_DECLARED',
      },

      // Persona-phase save-and-lock state. true = first-time setup form
      // for this activity has been submitted (e.g. dairy aggregate herd
      // form, fishery aggregate ponds form, or first crop cycle for
      // CROP/HORTI). When all of a farmer's ACTIVE subscriptions have
      // setup_complete = true, the entry router routes directly to
      // /(tabs) on every MPIN login — no setup wizards.
      setup_complete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      setup_completed_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'FarmerActivitySubscription',
      tableName: 'farmer_activity_subscriptions',
      timestamps: true,
      underscored: true,
      indexes: [
        { name: 'idx_fas_farmer_status', fields: ['farmer_id', 'status'] },
        { name: 'idx_fas_farmer_priority', fields: ['farmer_id', 'priority_rank'] },
      ],
    }
  );

  // Expose enum values for use in services / validators / seeders
  FarmerActivitySubscription.ACTIVITY_CODES = ACTIVITY_CODES;
  FarmerActivitySubscription.STATUSES = STATUSES;
  FarmerActivitySubscription.TIERS = TIERS;
  FarmerActivitySubscription.HEALTH_STATUSES = HEALTH_STATUSES;
  FarmerActivitySubscription.SOURCES = SOURCES;

  return FarmerActivitySubscription;
};
