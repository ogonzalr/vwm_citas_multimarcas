const Pool = require('pg').Pool
const pool = new Pool({
  host     : 'database-1.cvr1amp0chg1.us-east-1.rds.amazonaws.com',
  user     : 'postgres',
  password : 'VWOptim2020mm',
  database: 'postgres',
  port     : 5432,
})

// Load the AWS SDK for Node.js
const AWS = require('aws-sdk');
// Set the region 
AWS.config.update({region: 'us-east-2'});

// Create an SQS service object
const sqs = new AWS.SQS({apiVersion: '2012-11-05'});

const consultarHorarios = (request, response) => {

  response.setHeader("Content-Type", "application/json");
  //obtiene los parametros del query 
  const idConcesionario = request.query.idConcesionario;
  const uuid = request.query.uuid;
  const fechaInicial = request.query.fechaInicial;
  const fechaFinal = request.query.fechaFinal;
  const tipoServicio   = request.query.tipoServicio;
  //JSON de respuesta 
  var bodyResp = {
    idConcesionario : idConcesionario,
    uuid : uuid,
    fechaInicial : fechaInicial,
    fechaFinal : fechaFinal,
    tipoServicio : tipoServicio
  } 

  var myJSON = JSON.stringify(bodyResp);

  var operacion = 'consultarHorarios';
  var tipo = 'req';

  var queueURLreq;
  var queueURLres;

  const authorizationMiddleware = request.get('authorizationMiddleware');
  const authorizationDMS = request.get('authorizationDMS');
  

  pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
    if (error) {

      console.log(error)
      response.status(400).send('Error al buscar el parametro en la BD ' + error.message)

    }else{

      if(res.rows.length>0){

        console.log(res.rows[0].sqs_url)
        queueURLreq = res.rows[0].sqs_url;

        //Envia a SQS del lambda al DMS
        var params = {
          DelaySeconds: 10,
          MessageBody: myJSON,
          QueueUrl: queueURLreq
        };
        sqs.sendMessage(params, function(err, data) {
          if (err) {
            console.log("Error", err);
            response.status(400).send('Error ' + err.message)
          } else {

            console.log("Success", data.MessageId);
            const now = new Date();
            pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
            , [data.MessageId, uuid, operacion,'Channel_source', myJSON, authorizationMiddleware, authorizationDMS, now], (error, results) => {
              if (error) {
                console.log(error)
                response.status(400).send('Error al registrar en la BD ' + error.message)
              }
              console.log(results)
              }); 
          }
        });

        tipo = 'resp';

        pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
          if (error) {
            console.log(error)
            response.status(400).send('Error al buscar el parametro en la BD ' + error.message)
          }else{
            if(res.rows.length>0){
              
              console.log(res.rows[0].sqs_url)
              queueURLres = res.rows[0].sqs_url;
  
              //Escucha en la SQS del DMS al lambda
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
                if(data.Messages!=null){
                  data.Messages.forEach(function (elemento, indice) {
                  var jsonBody = JSON.parse(elemento.Body);
              
                  if(jsonBody.uuid == uuid){
                    //console.log(jsonBody, indice);
                    var messageId = elemento.MessageId;
                    var deleteParams = {
                      QueueUrl: queueURLres,
                      ReceiptHandle: elemento.ReceiptHandle
                    };
                    sqs.deleteMessage(deleteParams, function(err, data) {
                      if (err) {
                        console.log("Delete Error", err);
                        response.status(400).send('Error'+err.message);
                        
                      } else {
      
                        console.log("Message Deleted", data);
                        const now = new Date()
                        pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
                        , [messageId, uuid, operacion,'Channel_source', jsonBody,authorizationMiddleware, authorizationDMS, now], (error, results) => {
                          if (error) {
                            console.log(error)
                            response.status(400).send('Error al registrar en la BD ' + error.message)
                          }
                          console.log(results)
                          response.status(200).send(jsonBody)
                          }) 
                      }
                    }); 
              
                  }
                });
                }
                else{
                  console.log('No se recibio ningun mensaje')
                  response.status(400).send('No se recibio ningun mensaje')
                }
              });
  
  
            }
            else{
              console.log(res.rows)
              response.status(400).send('No se encontro el parametro resp')
            }
      
          }

        });

      }
      else{
        console.log(res.rows)
        response.status(400).send('No se encontro el parametro req')
      }

    }
    
  });
     
}

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
        console.log(error)
        response.status(400).send('Error al buscar el parametro en la BD ' + error.message);
      }else{
        if(res.rows.length>0){
          console.log(res.rows[0].sqs_url)
          queueURLreq = res.rows[0].sqs_url;

          var params = {
            DelaySeconds: 10,
            MessageBody: myJSON,
            QueueUrl: queueURLreq
          };
          sqs.sendMessage(params, function(err, data) {
            if (err) {
              console.log("Error", err);
              response.status(400).send('Error ' + err.message);
            } else {
              console.log("Success", data.MessageId);
              const now = new Date()
              pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
              , [data.MessageId, uuid, operacion,'Channel_source', jsonBody,authorizationMiddleware, authorizationDMS, now], (error, results) => {
                if (error) {
                  console.log(error)
                  response.status(400).send('Error al registrar en la BD ' + error.message)
                }
                console.log(results)
                }); 
            }
          });

          tipo = 'resp';

          pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
            if (error) {
              console.log(error)
              response.status(400).send('Error al buscar el parametro en la BD ' + error.message)
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
                  if(data.Messages!=null){
                      
                      data.Messages.forEach(function (elemento, indice) {
                      var jsonBody = JSON.parse(elemento.Body);
      
                      if(jsonBody.uuid == uuid){
                        var messageId = elemento.MessageId;
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
                            , [messageId, uuid, operacion,'Channel_source', jsonBody,authorizationMiddleware, authorizationDMS, now], (error, results) => {
                              if (error) {
                                console.log(error);
                                response.status(400).send('Error al registrar en la BD ' + error.message);
                              }
                              console.log(results);
                              });
                              
                            pool.query('INSERT INTO public.tb_cita_servicio(id_cita, uuid, id_message_req, id_message_res, nombre, ap_pat, ap_mat, numero_chasis, numero_serie, fecha, horario, asesor, telefono_fijo, telefono_movil, email, estado, ciudad, fecha_ultimo_servicio, id_concesionario, marca, modelo, anio, kilometraje_auto, kilometraje_servicio, tipo_servicio, comentarios) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)'
                              , [jsonBody.idCita, uuid, 'id_message_req', 'id_message_res', nombre, apePat, apeMat, numeroChasis, numeroSerie, fecha, horario, asesor, telefonoFijo, telefonoMovil, email, estado, ciudad, fechaUltimoServicio, idConcesionario, marca, modelo, anio, kilometrajeAuto,kilometrajeServicio, tipoServicio, comentarios], (error, results) => {
                                if (error) {
                                  console.log(error)
                                  response.status(400).send('Error al registrar en la BD' + error.message)
                                }
                                response.status(201).send(jsonBody);
                              });

                          }
                        }); 
                  
                      }
                  });
                  }
                  else{
                    console.log('No se recibio ningun mensaje')
                    response.status(400).send('No se recibio ningun mensaje')
                  }
                
                }); 

              }
              else{
                console.log(res.rows)
                response.status(400).send('No se encontro el parametro')
              }
        
            }
            
          });
        
        }
        else{
          console.log(res.rows)
          response.status(400).send('No se encontro el parametro')
        }
  
      }
    });

  }

  const modificarCita = (request, response) => {

    response.setHeader("Content-Type", "application/json");

    const uuid = request.query.uuid;
    const numeroChasis = request.query.uuid;
    const telefono = request.query.telefono;
    const email = request.query.email;

     const idConcesionario = request.query.idConcesionario;

    var bodyResp = {
      uuid : uuid,
      numeroChasis : numeroChasis,
      telefono : telefono,
      email : email,
      idConcesionario : idConcesionario
    } 
  
    var myJSON = JSON.stringify(bodyResp);

    var operacion = 'modificarCita';
    var tipo = 'req';
  
    var queueURLreq;
    var queueURLres;
  
    const authorizationMiddleware = request.get('authorizationMiddleware');
    const authorizationDMS = request.get('authorizationDMS');

    pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
      if (error) {
        console.log(error)
        response.status(400).send('Error al buscar el parametro en la BD ' + error.message)
      }else{
        if(res.rows.length>0){
          console.log(res.rows[0].sqs_url)
          queueURLreq = res.rows[0].sqs_url;
        }
        else{
          console.log(res.rows)
          response.status(400).send('No se encontro el parametro')
        }
  
      }
      
    });

    var params = {
        DelaySeconds: 10,
        MessageBody: myJSON,
        QueueUrl: queueURLreq
      }
      sqs.sendMessage(params, function(err, data) {
        if (err) {
          console.log("Error", err);
          response.status(400).send('Error ' + err.message);
        } else {
          console.log("Success", data.MessageId);
          const now = new Date()
          pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
          , [data.MessageId, uuid, operacion,'Channel_source', jsonBody, authorizationMiddleware, authorizationDMS, now], (error, results) => {
            if (error) {
              console.log(error)
              response.status(400).send('Error al registrar en la BD ' + error.message)
            }
            console.log(results)
            }) 
        }
      })

      tipo = 'resp';

      pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
        if (error) {
          console.log(error)
          response.status(400).send('Error al buscar el parametro en la BD ' + error.message)
        }else{
          if(res.rows.length>0){
            console.log(res.rows[0].sqs_url)
            queueURLres = res.rows[0].sqs_url;
          }
          else{
            console.log(res.rows)
            response.status(400).send('No se encontro el parametro')
          }
    
        }
        
      });

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

        const idCita = '';
        const idConcesionario = '';
        
        sqs.receiveMessage(params, function(err, data) {
          if (err) {
            console.log("Receive Error", err);
            response.status(400).send('Receive Error ' + err.message);
          }
          console.log(data)
          if(data.Messages!=null){
              
              data.Messages.forEach(function (elemento, indice) {
              var jsonBody = JSON.parse(elemento.Body);
          
              console.log(jsonBody, indice);
        
              if(jsonBody.uuid == uuid){
                idCita = jsonBody.idCita;
                idConcesionario = jsonBody.idConcesionario;

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
                    const now = new Date()
                    pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
                    , [data.MessageId, uuid, 'modificarCita','Channel_source', jsonBody,'authorizationMiddleware', 'authorizationDMS', now], (error, results) => {
                      if (error) {
                        console.log(error)
                        response.status(400).send('Error al registrar en la BD ' + error.message)
                      }
                      console.log(results)
                      }) 
                  }
                }); 
          
              }
          });
          }
          else{
            console.log('No se recibio ningun mensaje')
            response.status(400).send('No se recibio ningun mensaje')
          }
        
        })
        const queueURLreqEliminar =  "https://sqs.us-east-2.amazonaws.com/811219751427/vwmx_req_cancelar_cita_to_dms";
        const queueURLresEliminar =  "https://sqs.us-east-2.amazonaws.com/811219751427/vwmx_resp_cancelar_cita_to_lambda";

        var bodyEliminar = {
          uuid: uuid,
          idCita:idCita,
          idConcesionario:idConcesionario
        }
        var eliminarJSON = JSON.stringify(bodyEliminar);
        var params = {
            DelaySeconds: 10,
            MessageBody: eliminarJSON,
            QueueUrl: queueURLreqEliminar
          }
        sqs.sendMessage(params, function(err, data) {
          if (err) {
            console.log("Error", err);
            response.status(400).send('Delete Error ' + err.message);
          } else {
            console.log("Success", data.MessageId);
            const now = new Date()
            pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
            , [data.MessageId, uuid, 'modificarCita','Channel_source', jsonBody,'authorizationMiddleware', 'authorizationDMS', now], (error, results) => {
              if (error) {
                console.log(error)
                response.status(400).send('Error al registrar en la BD ' + error.message)
              }
              console.log(results)
              }) 
          }
        })

        var params = {
          AttributeNames: [
              "SentTimestamp"
          ],
          MaxNumberOfMessages: 10,
          MessageAttributeNames: [
              "All"
          ],
          QueueUrl: queueURLresEliminar,
          VisibilityTimeout: 5,
          WaitTimeSeconds: 1
          };

          sqs.receiveMessage(params, function(err, data) {
            if (err) {
              console.log("Receive Error", err);
              response.status(400).send('Error ' + err.message);
            }
            console.log(data)
            if(data.Messages!=null){
                
                data.Messages.forEach(function (elemento, indice) {
                var jsonBody = JSON.parse(elemento.Body);
            
                console.log(jsonBody, indice);
          
                if(jsonBody.uuid == uuid){
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
                      const now = new Date()
                      pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
                      , [data.MessageId, uuid, 'modificarCita','Channel_source', jsonBody,'authorizationMiddleware', 'authorizationDMS', now], (error, results) => {
                        if (error) {
                          console.log(error)
                          response.status(400).send('Error al registrar en la BD ' + error.message)
                        }
                        console.log(results)
                        }) 
                    }
                  }); 
            
                }
            });
            }
            else{
              console.log('No se recibio ningun mensaje');
              response.status(400).send('No se recibio ningun mensaje');
            }
          
          })
  }

  const cancelarCita = (request, response) => {

    response.setHeader("Content-Type", "application/json");
    
    const { uuid,
            idCita,
            idConcesionario
          } = request.body;

    var myJSON = JSON.stringify(request.body);

    var operacion = 'cancelarCita';
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
          sqs.sendMessage(params, function(err, data) {
            if (err) {
              console.log("Error", err);
              response.status(400).send('Delete Error ' + err.message);
            } else {
              console.log("Success", data.MessageId);
              const now = new Date();
              pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
              , [data.MessageId, uuid, operacion,'Channel_source', jsonBody, authorizationMiddleware, authorizationDMS, now], (error, results) => {
                if (error) {
                  console.log(error);
                  response.status(400).send('Error al registrar en la BD ' + error.message);
                }
                console.log(results);
                }) 
            }
          });

          tipo = 'resp';

          pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
            if (error) {
              console.log(error)
              response.status(400).send('Error al buscar el parametro en la BD ' + error.message)
            }else{
              if(res.rows.length>0){
                console.log(res.rows[0].sqs_url)
                queueURLres = res.rows[0].sqs_url;

                //Escucha en la SQS del DMS al lambda
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
                      response.status(400).send('Error ' + err.message);
                    }
                    if(data.Messages!=null){
                        
                        data.Messages.forEach(function (elemento, indice) {
                        var jsonBody = JSON.parse(elemento.Body);
                        
                        if(jsonBody.uuid == uuid){
                          var messageId = elemento.MessageId;
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
                              const now = new Date()
                              pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
                              , [messageId, uuid, operacion,'Channel_source', jsonBody, authorizationMiddleware, authorizationDMS, now], (error, results) => {
                                if (error) {
                                  console.log(error)
                                  response.status(400).send('Error al registrar en la BD ' + error.message)
                                }
                                console.log(results)
                                response.status(200).send(jsonBody)
                                }) 
                            }
                          }); 
                    
                        }
                    });
                    }
                    else{
                      console.log('No se recibio ningun mensaje');
                      response.status(400).send('No se recibio ningun mensaje')
                    }
                  
                  });

              }
              else{
                console.log(res.rows)
                response.status(400).send('No se encontro el parametro resp')
              }
        
            }
            
          });
        }
        else{
          console.log(res.rows)
          response.status(400).send('No se encontro el parametro req')
        }
  
      }  
    });

  }

  const consultarCita = (request, response) => {
 
    response.setHeader("Content-Type", "application/json");
    
    const uuid = request.query.uuid;
    const numeroChasis = request.query.uuid;
    const telefono = request.query.telefono;
    const email = request.query.email;

    const idConcesionario = request.query.idConcesionario;

    var bodyResp = {
      uuid : uuid,
      numeroChasis : numeroChasis,
      telefono : telefono,
      email : email,
      idConcesionario : idConcesionario
    } 
  
    var myJSON = JSON.stringify(bodyResp);

    var operacion = 'consultarCita';
    var tipo = 'req';
  
    var queueURLreq;
    var queueURLres;
  
    const authorizationMiddleware = request.get('authorizationMiddleware');
    const authorizationDMS = request.get('authorizationDMS');

    pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
      if (error) {
        console.log(error)
        response.status(400).send('Error al buscar el parametro en la BD ' + error.message)
      }else{
        if(res.rows.length>0){
          console.log(res.rows[0].sqs_url);
          queueURLreq = res.rows[0].sqs_url;

          var params = {
            DelaySeconds: 10,
            MessageBody: myJSON,
            QueueUrl: queueURLreq
          }

          sqs.sendMessage(params, function(err, data) {
            if (err) {
              console.log("Error", err);
              response.status(400).send('Error ' + err.message);
            } else {
              console.log("Success", data.MessageId);
              const now = new Date()
              pool.query('INSERT INTO public.tb_record_sqs_message(id_message, uuid, operation, channel_source, body_message, "authorizationMiddleware", "authorizationDMS", datetime_generated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
              , [data.MessageId, uuid, operacion,'Channel_source', jsonBody, authorizationMiddleware, authorizationDMS, now], (error, results) => {
                if (error) {
                  console.log(error)
                  response.status(400).send('Error al registrar en la BD ' + error.message)
                }
                console.log(results)
                }) 
            }
          });

          tipo = 'resp';

          pool.query('SELECT ct_sqs_url_mapping.sqs_url FROM public.ct_sqs_url_mapping where ct_sqs_url_mapping.id_concesionario = $1 and ct_sqs_url_mapping.tipo = $2 and ct_sqs_url_mapping.operacion = $3', [idConcesionario, tipo, operacion] ,(error, res) => {
            if (error) {
              console.log(error);
              response.status(400).send('Error al buscar el parametro en la BD ' + error.message);
            }else{
              if(res.rows.length>0){
                console.log(res.rows[0].sqs_url);
                queueURLres = res.rows[0].sqs_url;

                //Escucha en la SQS del DMS al lambda
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
                    response.status(400).send('Error ' + err.message);
                  }
                  
                  if(data.Messages!=null){
                      
                      data.Messages.forEach(function (elemento, indice) {
                      var jsonBody = JSON.parse(elemento.Body);
                
                      if(jsonBody.uuid == uuid){
                        var messageId = elemento.MessageId;
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
                            , [messageId, uuid, operacion,'Channel_source', jsonBody, authorizationMiddleware, authorizationDMS, now], (error, results) => {
                              if (error) {
                                console.log(error);
                                response.status(400).send('Error al registrar en la BD ' + error.message);
                              }
                              console.log(results);
                              response.status(200).send(jsonBody);
                              }) 
                          }
                        }); 
                  
                      }
                  });
                  }
                  else{
                    console.log('No se recibio ningun mensaje');
                    response.status(400).send('No se recibio ningun mensaje');
                  }
                
                });


              }
              else{
                console.log(res.rows);
                response.status(400).send('No se encontro el parametro resp');
              }
        
            }
            
          });

        }
        else{
          console.log(res.rows);
          response.status(400).send('No se encontro el parametro req');
        }
  
      }  
    });

  }

  module.exports = {
    consultarHorarios,
    agendarCita,
    modificarCita,
    cancelarCita,
    consultarCita,
  }