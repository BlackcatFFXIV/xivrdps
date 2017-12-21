const mongoose = require('mongoose')

const ContributionEntry = new mongoose.Schema({
  name: String,
  type: String,
  total: Number,
  isSolo: Boolean,
  dps: Number,
  dpsContribution: Number
})

module.exports = ContributionEntry
