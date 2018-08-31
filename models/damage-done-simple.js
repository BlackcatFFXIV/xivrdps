const mongoose = require('mongoose')

const DamageDoneSimple = new mongoose.Schema({
  name: String,
  type: String,
  total: Number,
  id: Number,
  type: String,
  personalDPS: String,
  personalDPSFull: Number
})

module.exports = DamageDoneSimple
