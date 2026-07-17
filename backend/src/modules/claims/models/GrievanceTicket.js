/**
 * GrievanceTicket — farmer grievance with a 15-day disposal clock (§5.2; OG
 * 30.6.5). Filed from any channel, routed to the responsible desk, with an SLA.
 *
 *   open → ack → in_progress → resolved | escalated
 */
const { Model } = require('sequelize');

const STATES = ['open', 'ack', 'in_progress', 'resolved', 'escalated'];
const PRIORITIES = ['low', 'med', 'high'];
const CHANNELS = ['app', 'voice', 'posp', 'bank'];

module.exports = (sequelize, DataTypes) => {
  class GrievanceTicket extends Model {
    static associate(models) {
      if (models.User) GrievanceTicket.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }
  GrievanceTicket.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    ticket_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    farmer_id: { type: DataTypes.INTEGER, allowNull: false },
    policy_id: { type: DataTypes.INTEGER, allowNull: true },
    claim_id: { type: DataTypes.INTEGER, allowNull: true },
    category: { type: DataTypes.STRING(60), allowNull: false }, // premium_no_policy / claim_delay / tag / valuation
    priority: { type: DataTypes.ENUM(...PRIORITIES), allowNull: false, defaultValue: 'med' },
    channel_filed: { type: DataTypes.ENUM(...CHANNELS), allowNull: false, defaultValue: 'app' },
    routed_to: { type: DataTypes.STRING(60), allowNull: true }, // insurer / bank / GRC
    description: { type: DataTypes.STRING(500), allowNull: true },
    status: { type: DataTypes.ENUM(...STATES), allowNull: false, defaultValue: 'open' },
    disposal_due_at: { type: DataTypes.DATE, allowNull: false }, // filed + 15 days
    filed_at: { type: DataTypes.DATE, allowNull: false },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    resolution_note: { type: DataTypes.STRING(500), allowNull: true },
  }, {
    sequelize, modelName: 'GrievanceTicket', tableName: 'grievance_tickets',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['farmer_id'] }, { fields: ['status'] }, { fields: ['disposal_due_at'] }],
  });
  GrievanceTicket.STATES = STATES;
  return GrievanceTicket;
};
