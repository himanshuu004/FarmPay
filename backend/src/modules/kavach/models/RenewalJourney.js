/**
 * RenewalJourney — the renewal engine's state per policy (§5.1; the #1-ROI
 * slice). One journey tracks a policy from lead-window entry to outcome:
 *
 *   pending → reminded → renewed | lapsed | opted_out
 *
 * auto_renew_opt_in is OPT-IN only — auto-renewal without opt-in is out of scope
 * (CLAUDE.md). renewed_policy_id links the cloned next-term policy.
 */
const { Model } = require('sequelize');

const STATES = ['pending', 'reminded', 'renewed', 'lapsed', 'opted_out'];
const CHANNELS = ['sms', 'whatsapp', 'push', 'ivr'];

module.exports = (sequelize, DataTypes) => {
  class RenewalJourney extends Model {
    static associate(models) {
      if (models.InsurancePolicy) RenewalJourney.belongsTo(models.InsurancePolicy, { foreignKey: 'policy_id', as: 'policy' });
      if (models.InsurancePolicy) RenewalJourney.belongsTo(models.InsurancePolicy, { foreignKey: 'renewed_policy_id', as: 'renewedPolicy' });
    }
  }
  RenewalJourney.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    journey_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    policy_id: { type: DataTypes.INTEGER, allowNull: false },
    farmer_id: { type: DataTypes.INTEGER, allowNull: false },
    due_date: { type: DataTypes.DATEONLY, allowNull: false }, // = policy.end_date
    reminder_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_reminder_at: { type: DataTypes.DATE, allowNull: true },
    channel_last: { type: DataTypes.ENUM(...CHANNELS), allowNull: true },
    auto_renew_opt_in: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.ENUM(...STATES), allowNull: false, defaultValue: 'pending' },
    renewed_policy_id: { type: DataTypes.INTEGER, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'RenewalJourney', tableName: 'renewal_journeys',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['policy_id'], unique: true }, { fields: ['farmer_id'] }, { fields: ['status'] }, { fields: ['due_date'] }],
  });
  RenewalJourney.STATES = STATES;
  RenewalJourney.CHANNELS = CHANNELS;
  return RenewalJourney;
};
