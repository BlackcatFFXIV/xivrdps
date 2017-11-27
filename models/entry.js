const mongoose = require('mongoose')

const Entry = new mongoose.Schema({
  name: String,
  id: Number,
  guid: Number,
  type: String,
  icon: String,
  total: Number,
  activeTime: Number,
  activeTimeReduced: Number,
})

module.exports = Entry
