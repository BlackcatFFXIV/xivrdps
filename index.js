const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const mustacheExpress = require('mustache-express')
const mongoose = require('mongoose')
const dbURI = process.env.MONGO_DB_URL
const port = process.env.PORT || 8080
const Views = require('./views')
const FFLogs = require('./fflogs')
mongoose.Promise = global.Promise;
mongoose.connect(dbURI, { useMongoClient: true })

app.engine('html', mustacheExpress())
app.set('view engine', 'html')
app.set('views', __dirname + '/views')
app.use(express.static('public'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))

let views = new Views(app, new FFLogs())

app.listen(port, () => {
  console.log('FFLogs Raid DPS Calculator on port ' + port + '!')
})
