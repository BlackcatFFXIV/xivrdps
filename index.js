const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const mustacheExpress = require('mustache-express')
const Views = require('./views')
const port = process.env.PORT || 8080
/*const mongoose = require('mongoose')
const dbURI = process.env.MONGO_DB_URL
const FFLogs = require('./fflogs')
mongoose.Promise = global.Promise;
mongoose.connect(dbURI, {useNewUrlParser: true})*/

app.engine('html', mustacheExpress())
app.set('view engine', 'html')
app.set('views', __dirname + '/views')
app.use(express.static('public'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))

let views = new Views(app)

app.listen(port, () => {
  console.log('FFLogs Raid DPS Calculator on port ' + port + '!')
})
