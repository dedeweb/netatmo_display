module.exports = ledMgr;

function ledMgr(opt) {
  //ext. libs
  const fs = require('fs');
  const path = require('path');
  const PROD = !fs.existsSync(path.join(__dirname, 'debug'));
  
 
  let led = {};
  if (PROD) {
    led = {
      red: new Gpio(2, 'low'),
      green: new Gpio(3, 'low')
    }
  }

  //consts
  const led_flash_interval = 1000;
  
  // options
  let logger = opt.logger;

  // API/data for end-user
  return {
    goBusy: goBusy,
    goBusyGreen: goBusyGreen,
    goBusyFlashing: goBusyFlashing,
    exitBusy: exitBusy
  }

  // private functionns

  var ledFlashIntervalId = 0;

  function ledRedOn() {
    if (led.red) {
      led.red.writeSync(1);
    }
    ledGreenOff();
    logger.debug('[led] red ON');
  }

  function ledRedOff() {
    if (led.red) {
      led.red.writeSync(0);
    }
    logger.debug('[led] red OFF');
  }

  function ledGreenOn() {
    if (led.green) {
      led.green.writeSync(1);
    }
    ledRedOff();
    logger.debug('[led] green ON');
  }

  function ledGreenOff() {
    if (led.green) {
      led.green.writeSync(0);
    }
    logger.debug('[led] green OFF');
  }

  function goBusy() {
    if (ledFlashIntervalId) {
      clearInterval(ledFlashIntervalId);
    }
    ledRedOn();
  }

  function goBusyGreen() {
    if (ledFlashIntervalId) {
      clearInterval(ledFlashIntervalId);
    }
    ledGreenOn();
  }

  function goBusyFlashing() {
    if (ledFlashIntervalId) {
      clearInterval(ledFlashIntervalId);
    }
    logger.info('red led flashing');

    let lighton = true;
    ledFlashIntervalId = setInterval(function() {
      if (lighton) {
        ledRedOn();
      } else {
        ledRedOff();
      }
      lighton = !lighton;
    }, led_flash_interval);
  }

  function exitBusy() {
    if (ledFlashIntervalId) {
      clearInterval(ledFlashIntervalId);
    }
    ledRedOff();
    ledGreenOff();
  }

}