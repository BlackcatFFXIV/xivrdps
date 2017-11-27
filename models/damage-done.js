const mongoose = require('mongoose')
const Entry = require('./entry')

const damageDoneSchema = new mongoose.Schema({
  entries: [Entry],
  totalTime: Number,
  start: Number,
  end: Number,
  translate: Boolean,
  targetbuffs: Number
})

const DamageDone = mongoose.model('DamageDone', damageDoneSchema)

module.exports = DamageDone
