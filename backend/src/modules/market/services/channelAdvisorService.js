/**
 * channelAdvisorService — "where should I sell my milk?" Ranks the society route
 * (the passbook chart) against indicative PRIVATE/COMPANY channels for a given
 * volume + quality. Advice, not a directive: the society settlement note is
 * surfaced honestly so a marginally higher cash rate isn't the whole story
 * (society milk unlocks passbook + 70% input credit + insurance).
 */
const milkRate = require('./milkRateService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const advise = async ({ litres, fatPct, snfPct, scope = 'DEFAULT' }) => {
  const { MarketChannel } = getDb();

  // The society route is always the milk-rate chart.
  const society = await milkRate.estimate({ litres, fatPct, snfPct, scope });
  const options = [{
    channelRef: 'SOCIETY', name: 'Your dairy society', channelType: 'SOCIETY',
    ratePerLitre: society.ratePerLitre, amount: society.amount,
    settlementNote: 'Paid on the society cycle; unlocks your passbook, 70% input credit and insurance path.',
  }];

  const channels = MarketChannel ? await MarketChannel.findAll({ where: { is_active: true, channel_type: ['PRIVATE', 'COMPANY'] } }) : [];
  for (const c of channels) {
    const rate = milkRate.evaluateRate(c.method_json, { fatPct, snfPct });
    options.push({
      channelRef: c.channel_ref, name: c.name, channelType: c.channel_type,
      ratePerLitre: rate, amount: r2(rate * Number(litres || 0)), settlementNote: c.settlement_note || null,
    });
  }

  options.sort((a, b) => b.ratePerLitre - a.ratePerLitre);
  const best = options[0];
  const societyRank = options.findIndex((o) => o.channelType === 'SOCIETY') + 1;
  const gapVsSociety = r2(best.ratePerLitre - society.ratePerLitre);

  return {
    input: { litres: Number(litres || 0), fatPct: Number(fatPct || 0), snfPct: Number(snfPct || 0) },
    options,
    recommendation: {
      bestChannelRef: best.channelRef,
      societyRank,
      societyIsBest: best.channelType === 'SOCIETY',
      gapVsSocietyPerLitre: gapVsSociety, // 0 when society leads
      note: best.channelType === 'SOCIETY'
        ? 'Your society pays best on this quality — and you keep the passbook, credit and insurance benefits.'
        : `A private channel shows ₹${gapVsSociety}/L more cash today, but selling to your society keeps your 70% input credit, passbook history and insurance path.`,
    },
  };
};

module.exports = { advise };
