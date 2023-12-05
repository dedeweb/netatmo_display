module.exports = apiServer;

function apiServer(opt) {
  //ext. libs
  const fs = require('fs');
  const path = require('path');
  const PROD = !fs.existsSync(path.join(__dirname, 'debug'));
  const express = require('express');
  const app = express();
  const exec = require('child_process').exec;
  
  //consts
  const led_flash_interval = 1000;
  
  // options
  let logger = opt.logger;
  let refreshScreenCallback = opt.refreshScreenCallback;
  let fullRefreshCallback = opt.fullRefreshCallback;
  
  let port = 80;
  if(!PROD) {
    port=8080;
  }

  app.post('/screenrefresh', function(req, res) {
    logger.info('[api] requesting screen refresh');
    if (refreshScreenCallback) {
      refreshScreenCallback();
      res.status(200).send('OK');
    } else {
      logger.error('[api] no screen refresh callback :(');
      res.status(500).send('no callback');
    }
  });
  
  app.post('/fullrefresh', function(req, res) {
    logger.info('[api] requesting full refresh');
    if (fullRefreshCallback) {
      fullRefreshCallback();
      res.status(200).send('OK');
    } else {
      logger.error('[api] no full refresh callback :(');
      res.status(500).send('no callback');
    }
      
  });
  
  app.post('/reboot', function(req, res) {
    logger.info('[api] requesting reboot');
    if(PROD) {
      exec('/sbin/reboot', function (msg) {
        logger.info(msg);
      });
    } else {
      logger.warn('[api] fake reboot ! ');
    }
    res.status(200).send('OK');
  });
  
  
  app.all('*', function(req, res){
    var requestedUrl = req.protocol + '://' + req.get('Host') + req.url;
    logger.error('[api] wrong request ' + req.method + ' '+ requestedUrl);
    res.status(404).send('Not found');
  });
  
  
  logger.info('[api] starting api server on port ' + port);
  app.listen(port);
}