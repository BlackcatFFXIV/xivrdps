const mongoose = require('mongoose')

const ContributionEntry = new mongoose.Schema({
  id: Number,
  name: String,
  type: String,
  total: Number,
  isSolo: Boolean,
  dps: Number,
  dpsContribution: Number,
  petOwnerId: String,
  petOwnerName: String
})

module.exports = ContributionEntry
