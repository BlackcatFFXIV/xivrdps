const mongoose = require('mongoose')
const ContributionEntry = require('./contribution-entry')

const ContributionSource = new mongoose.Schema({
  source: Number,
	dps: Number,
	total: Number,
  entries: [ContributionEntry]
})

module.exports = ContributionSource
