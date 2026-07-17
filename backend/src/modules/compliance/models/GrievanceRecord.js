/**
 * GrievanceRecord Model
 * Tracks farmer grievances, escalation, and resolution workflow.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GrievanceRecord extends Model {
    static associate(models) {
      GrievanceRecord.belongsTo(models.User, {
        foreignKey: 'farmer_id',
        as: 'farmer',
      });
    }
  }

  GrievanceRecord.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      grievance_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      category: {
        type: DataTypes.ENUM(
          'service_quality', 'fee_dispute', 'loan_denial',
          'disclosure_issue', 'repayment_issue', 'data_privacy', 'other'
        ),
        allowNull: false,
      },
      description: { type: DataTypes.TEXT, allowNull: false },
      priority: {
        type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
        defaultValue: 'medium',
      },
      status: {
        type: DataTypes.ENUM('filed', 'acknowledged', 'investigating', 'resolved', 'escalated'),
        allowNull: false,
        defaultValue: 'filed',
      },
      assigned_to: { type: DataTypes.INTEGER, allowNull: true },
      resolution: { type: DataTypes.TEXT, allowNull: true },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
      escalated_at: { type: DataTypes.DATE, allowNull: true },
      escalation_reason: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'GrievanceRecord',
      tableName: 'grievance_records',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['grievance_uuid'], unique: true },
        { fields: ['farmer_id'] },
        { fields: ['status'] },
      ],
    }
  );

  return GrievanceRecord;
};
