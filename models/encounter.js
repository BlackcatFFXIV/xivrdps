const mongoose = require('mongoose')

const Encounter = new mongoose.Schema({
  id: String,
  start_time: Number,
  end_time: String,
  boss: Number,
  size: Number,
  difficulty: Number,
  kill: Boolean,
  partial: Number,
  standardComposition: Boolean,
  bossPercentage: Number,
  fightPercentage: Number,
  lastPhaseForPercentageDisplay: Number,
  name: String,
  zoneID: Number,
  zoneName: String,
  fightId: Number,
  totalTime: Number,
  patch: String,
  patchStr: String,
  date: Date,
  dateStr: String
})

module.exports = Encounter
