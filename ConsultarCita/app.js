// app.js

const express = require('express')
const bodyParser = require('body-parser')
const sls = require('serverless-http')
const app = express()
const db = require('./queries')

app.use(bodyParser.json())
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
)

app.get('/api/citas/consultarCita', db.consultarCita)

module.exports.server = sls(app)
