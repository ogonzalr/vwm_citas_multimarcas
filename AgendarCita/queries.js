const Pool = require('pg').Pool
const pool = new Pool({
  host     : 'vwm-citas-servicio-multimarca.ccvsqygxcqrr.us-east-2.rds.amazonaws.com',
  user     : 'AdminVWM',
  password : 'Optimissa2020',
  database : 'vwm_citas_servicio_multimarca',
  port     : 5432,
})

// Load the AWS SDK for Node.js
const AWS = require('aws-sdk');
// Set the region 
AWS.config.update({region: 'us-east-2'});

// Create an SQS service object
const sqs = new AWS.SQS({apiVersion: '2012-11-05'});

const agendarCita = (request, response) => {
  response.setHeader("Content-Type", "application/json");
    
  const { uuid,
          nombre,
          apePat,
          apeMat,
          numeroChasis,
          numeroSerie,
          fecha,
          horario,
          asesor,
          telefonoFijo,
          telefonoMovil, 
          email,
          estado,
          ciudad,
          fechaUltimoServicio,
          idConcesionario,
          marca,
          modelo,
          anio,
          kilometrajeAuto,
          kilometrajeServicio, 
          tipoServicio,
          comentarios} = request.body
  
  var myJSON = JSON.stringify(request.body);

  var operacion = 'agendarCita';
  var tipo = 'req';

  var queueURLreq;
  var queueURLres;

  const authorizationMiddleware = request.get('authorizationMiddleware');
  const authorizationDMS = request.get('authorizationDMS');

  pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
    if (error) {
      console.log(error);
      response.status(400).send('Error al buscar el parametro en la BD ' + error.message);
    }else{
      if(res.rows.length>0){
        console.log(res.rows[0].sqs_url);
        queueURLreq = res.rows[0].sqs_url;

        var params = {
          DelaySeconds: 10,
          MessageBody: myJSON,
          QueueUrl: queueURLreq
        };
        var id_message_req;

        sqs.sendMessage(params, function(err, data) {
          if (err) {
            console.log("Error", err);
            response.status(400).send('Error ' + err.message);
          } else {
            id_message_req = data.MessageId;
            console.log("Success", id_message_req);
            const now = new Date();
            pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
            , [id_message_req, uuid, operacion,'Channel_source', myJSON,authorizationMiddleware, authorizationDMS, now], (error, results) => {
              if (error) {
                console.log(error);
                response.status(400).send('Error al registrar en la BD ' + error.message);
              }
              console.log(results);
              });
            tipo = 'resp';
            
            pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
              if (error) {
                console.log(error);
                response.status(400).send('Error al buscar el parametro en la BD ' + error.message);
              }else{
                if(res.rows.length>0){
                  console.log(res.rows[0].sqs_url)
                  queueURLres = res.rows[0].sqs_url;
    
                  var params = {
                    AttributeNames: [
                        "SentTimestamp"
                    ],
                    MaxNumberOfMessages: 10,
                    MessageAttributeNames: [
                        "All"
                    ],
                    QueueUrl: queueURLres,
                    VisibilityTimeout: 5,
                    WaitTimeSeconds: 1
                    };
                    
                  sqs.receiveMessage(params, function(err, data) {
                    if (err) {
                      console.log("Receive Error", err);
                      response.status(400).send('Receive Error ' + err.message)
                    }
                    else{
                      if(data.Messages!=null){
                        
                        data.Messages.forEach(function (elemento, indice) {
                        var jsonBody = JSON.parse(elemento.Body);
        
                        if(jsonBody.uuid == uuid){
                          var id_message_res = elemento.MessageId;
                          var deleteParams = {
                            QueueUrl: queueURLres,
                            ReceiptHandle: elemento.ReceiptHandle
                          };
                          sqs.deleteMessage(deleteParams, function(err, data) {
                            if (err) {
                              console.log("Delete Error", err);
                              response.status(400).send('Delete Error ' + err.message);
                            } else {
                              console.log("Message Deleted", data);
                              const now = new Date();
                              pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
                              , [id_message_res, uuid, operacion,'Channel_source', jsonBody,authorizationMiddleware, authorizationDMS, now], (error, results) => {
                                if (error) {
                                  console.log(error);
                                  response.status(400).send('Error al registrar en la BD ' + error.message);
                                }
                                console.log(results);

                                pool.query('INSERT INTO public.tb_cita_servicio(id_cita, uuid, id_message_req, id_message_res, nombre, ap_pat, ap_mat, numero_chasis, numero_serie, fecha, horario, asesor, telefono_fijo, telefono_movil, email, estado, ciudad, fecha_ultimo_servicio, id_concesionario, marca, modelo, anio, kilometraje_auto, kilometraje_servicio, tipo_servicio, comentarios) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)'
                                , [jsonBody.idCita, uuid, id_message_req, id_message_res, nombre, apePat, apeMat, numeroChasis, numeroSerie, fecha, horario, asesor, telefonoFijo, telefonoMovil, email, estado, ciudad, fechaUltimoServicio, idConcesionario, marca, modelo, anio, kilometrajeAuto,kilometrajeServicio, tipoServicio, comentarios], (error, results) => {
                                  if (error) {
                                    console.log(error);
                                    response.status(400).send('Error al registrar en la BD' + error.message);
                                  }
                                  response.status(201).send(jsonBody);
                                });
                                });
                            }
                          }); 
                        }
                    });
                    }
                    else{
                      console.log('No se recibio ningun mensaje');
                      response.status(400).send('No se recibio ningun mensaje');
                    }
                    }
                  }); 
                }
                else{
                  console.log(res.rows);
                  response.status(400).send('No se encontro el parametro');
                }
              }
            });
          }
        });
      }
      else{
        console.log(res.rows);
        response.status(400).send('No se encontro el parametro');
      }

    }
  });
}
  module.exports = {
    agendarCita
  }