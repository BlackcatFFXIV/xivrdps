const mongoose = require('mongoose')
const Encounter = require('./encounter')
const DamageDoneSimple = require('./damage-done-simple')
const Contribution = require('./contribution')

const resultSchema = new mongoose.Schema({
  id: String,
  fightId: Number,
  encounter: Encounter,
  damageDone: [DamageDoneSimple],
  contribution: [Contribution]
})

resultSchema.statics.findLatest = function (encounterId, cb) {
  this.findOne({ id: encounterId })
    .sort('-fightId')
    .exec(cb)
}

const Result = mongoose.model('Result', resultSchema)

module.exports = Result
