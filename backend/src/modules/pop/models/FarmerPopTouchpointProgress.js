/**
 * FarmerPopTouchpointProgress — per-farmer state for each PoP touchpoint.
 * Unique on (farmer_id, activity_code, touchpoint_number). Status moves
 * PENDING → CURRENT → DONE; score and inputs are set on completion.
 */

module.exports = (sequelize, DataTypes) => {
  const FarmerPopTouchpointProgress = sequelize.define(
    'FarmerPopTouchpointProgress',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      farmerId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: 'farmer_id',
      },
      activityCode: {
        type: DataTypes.ENUM(
          'CROP', 'DAIRY', 'FISHERY', 'HORTI', 'VEG',
          'POULTRY', 'GOATERY', 'LABOUR_WAGE',
          'SHOP_BUSINESS', 'REMITTANCE', 'OTHER'
        ),
        allowNull: false,
        field: 'activity_code',
      },
      // '' = activity-level progress (DAIRY/FISHERY which don't carry a
      // subtype in this table — they use herd_tier / operation_type on
      // their profile tables instead). For CROP/HORTI/POULTRY/GOATERY
      // this is the subtype code ('rice', 'broiler', …) and each subtype
      // tracks its own independent score.
      subtypeCode: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: '',
        field: 'subtype_code',
      },
      touchpointNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'touchpoint_number',
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'CURRENT', 'DONE', 'SKIPPED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      score: { type: DataTypes.INTEGER, allowNull: true },
      taskCompleted: { type: DataTypes.BOOLEAN, allowNull: true, field: 'task_completed' },
      timingStatus: {
        type: DataTypes.ENUM('ON_TIME', 'DELAYED', 'EARLY'),
        allowNull: true,
        field: 'timing_status',
      },
      inputsStatus: {
        type: DataTypes.ENUM('AS_PER_POP', 'DEVIATION', 'NOT_RECORDED'),
        allowNull: true,
        field: 'inputs_status',
      },
      actualCostInr: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        field: 'actual_cost_inr',
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      dataEntered: {
        type: DataTypes.JSON,
        allowNull: true,
        field: 'data_entered',
      },
      completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
    },
    {
      tableName: 'farmer_pop_touchpoint_progress',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['farmer_id', 'activity_code'], name: 'idx_pop_progress_farmer_activity' },
        { fields: ['farmer_id', 'activity_code', 'status'], name: 'idx_pop_progress_farmer_activity_status' },
        { fields: ['farmer_id', 'activity_code', 'subtype_code'], name: 'idx_pop_progress_farmer_activity_subtype' },
      ],
    }
  );

  return FarmerPopTouchpointProgress;
};
