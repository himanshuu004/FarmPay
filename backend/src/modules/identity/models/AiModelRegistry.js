/**
 * AiModelRegistry — the per-model lifecycle + KILL-SWITCH (CLAUDE.md #22).
 *
 *   registered → shadow → assist → automate_with_override → retired
 *
 * Only `assist` / `automate_with_override` may ACT on state; `shadow` (and any
 * model with kill_switch = true, or `retired`) observe-and-queue only. Thresholds
 * are config here, never code (#5).
 */
const { Model } = require('sequelize');

const STAGES = ['registered', 'shadow', 'assist', 'automate_with_override', 'retired'];

module.exports = (sequelize, DataTypes) => {
  class AiModelRegistry extends Model {
    static associate() {}
    /** Whether a model at this stage / switch may act on state (vs shadow-observe). */
    get canAct() { return !this.kill_switch && ['assist', 'automate_with_override'].includes(this.lifecycle_stage); }
  }
  AiModelRegistry.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    model_name: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    model_version: { type: DataTypes.STRING(40), allowNull: false },
    lifecycle_stage: { type: DataTypes.ENUM(...STAGES), allowNull: false, defaultValue: 'shadow' },
    kill_switch: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // e.g. { dedupeCosine: 0.15, matchCosine: 0.25, minQuality: 0.6, dim: 256 }
    thresholds: { type: DataTypes.JSONB, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'AiModelRegistry', tableName: 'ai_model_registry',
    timestamps: true, underscored: true,
  });
  AiModelRegistry.STAGES = STAGES;
  return AiModelRegistry;
};
