const mongoose = require('mongoose')
const ContributionEntry = require('./contribution-entry')

const Contribution = new mongoose.Schema({
  name: String,
	icon: String,
	dps: Number,
	total: Number,
  entries: [ContributionEntry]
})

module.exports = Contribution
