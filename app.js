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

app.get('/', async (req, res, next) => {
  res.status(200).send('Hello World!')
})

app.get('/api/citas/consultarHorarios', db.consultarHorarios)

app.get('/api/citas/consultarCita', db.consultarCita)

app.post('/api/citas/agendarCita', db.agendarCita)

app.get('/api/citas/modificarCita', db.modificarCita)

app.delete('/api/citas/cancelarCita', db.cancelarCita)


module.exports.server = sls(app)
