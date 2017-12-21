const mongoose = require('mongoose')

const DamageDoneSimple = new mongoose.Schema({
  name: String,
  type: String,
  total: Number,
  personalDPS: String,
  personalDPSFull: Number
})

module.exports = DamageDoneSimple
