const mongoose = require('mongoose')
const ContributionEntry = require('./contribution-entry')
const ContributionSource = require('./contribution-source')

const Contribution = new mongoose.Schema({
  name: String,
	icon: String,
  entries: [ContributionSource]
})

module.exports = Contribution
