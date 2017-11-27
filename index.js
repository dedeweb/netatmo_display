const bmp_lib = require('bitmap-manipulation');
const path = require('path');
//const netatmo = require('netatmo');
const request = require('request-promise');
const _ = require('lodash');

bmp_lib.BMPBitmap.prototype.drawTextRight = function(font, text, x, y) {
    let fontBitmap = font.getBitmap();
    let lineHeight = font.getLineHeight();
    let fontDetails = font.getDetails();
    let characterInfoMap = fontDetails.chars;
    let kernings = fontDetails.kernings;
    let transparentColor = font.getTransparentColor();
    let lines = text.split(/\r?\n|\r/);
    let lineX = x;
    for (let line of lines) {
        let lastCharacter = null;
        for (let i = line.length -1; i >= 0; i--) {
            let character = line[i];
            let characterInfo = characterInfoMap[character];
            if (!characterInfo) {
                continue;
            }
            let kerning = kernings[character];
            if (kerning && lastCharacter) {
                kerning = kerning[lastCharacter];
                if (kerning) {
                    x -= kerning.amount;
                }
            }
            this.drawBitmap(fontBitmap, x + characterInfo.xoffset - characterInfo.width, y + characterInfo.yoffset,
                transparentColor, characterInfo.x, characterInfo.y, characterInfo.width,
                characterInfo.height);
            x -= characterInfo.xadvance;
        }
        x = lineX;
        y += lineHeight;
    }
};
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


getDataFromNetatmo().then(function(data) {
    console.log(data);
    drawImage(data);
});




//--------------------------------------------------------------------------

function drawImage() {
    let bitmap = new bmp_lib.BMPBitmap(640,384);
    let palette = bitmap.palette;
    bitmap.clear(palette.indexOf(0xffffff));
    drawOutline(bitmap, palette);

    drawFirstCol(bitmap, palette, 12.5,53);
    drawCol(bitmap, palette, 160, 20, 43, 1200);
    drawCol(bitmap, palette, 320, 20, 43, 800);
    drawCol(bitmap, palette, 480, 20, 43, 800);
/*
    let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(36);
    bitmap.drawTextRight(font, "61", 350 , 145);
    font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(18);
    font.setColor(palette.indexOf(0x000000));
    bitmap.drawText(font, "dB", 255, 145);
*/
    bitmap.save('out.bmp');

}

function drawOutline(bitmap, palette) {
    bitmap.drawFilledRect(0,0,159,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
    bitmap.drawFilledRect(161,0,158,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
    bitmap.drawFilledRect(321,0,158,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
    bitmap.drawFilledRect(481,0,159,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
    bitmap.drawFilledRect(0,20  ,640,1, palette.indexOf(0xff0000), null);
    drawDotLine(bitmap, palette, 159, 20,364);
    drawDotLine(bitmap, palette, 319, 20,364);
    drawDotLine(bitmap, palette, 479, 20,364);

    let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(18);
    font.setColor(palette.indexOf(0xffffff));
    bitmap.drawText(font, "EXTÉRIEUR",15 , 1);
    bitmap.drawText(font, "SÉJOUR",175 , 1);
    bitmap.drawText(font, "CHAMBRE",335 , 1);
    bitmap.drawText(font, "BUREAU",495 , 1);
}

function drawFirstCol(bitmap, palette, temp, hum ) {
    let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(55);
    font.setColor(palette.indexOf(0x000000));
    bitmap.drawTextRight(font, '' + temp, 120, 30);
    bitmap.drawTextRight(font, '' + hum, 120, 90);

    font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(18);
    font.setColor(palette.indexOf(0x000000));

    bitmap.drawText(font, "°", 125, 30);
    bitmap.drawText(font, "%", 125, 90);
}

function drawCol(bitmap, palette, x, temp, hum, co2) {
    let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(36);
    font.setColor(palette.indexOf(0x000000));
    bitmap.drawTextRight(font, '' + temp, x + 90, 25);
    bitmap.drawTextRight(font, '' + hum, x + 90, 65);
    if (co2 > 1000) {
        bitmap.drawFilledRect(x + 1,105  ,158,40, null , palette.indexOf(0xff0000));
    }
    bitmap.drawTextRight(font, '' + co2, x + 90, 105);

    font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));
    font.setSize(18);
    font.setColor(palette.indexOf(0x000000));



    bitmap.drawText(font, "°", x + 95, 25);
    bitmap.drawText(font, "%", x + 95, 65);
    bitmap.drawText(font, "ppm", x + 95, 105);

}

function drawDotLine(bitmap, palette, left,top, height) {
    var pixon = true;
    for(var x=left; x<left+2; x++) {

        for(var y=top; y<top+height; y++) {
            if(pixon) {
                bitmap.setPixel(x,y,palette.indexOf(0x000000));
            } else {
                bitmap.setPixel(x,y,palette.indexOf(0xffffff));
            }
            pixon = !pixon;
        }
        pixon=false;
    }
}




function getDataFromNetatmo() {
    let accessToken = '';
    return request({
        method: 'POST',
        uri: 'https://api.netatmo.com/oauth2/token',
        form: {
            client_id: "5a1590ee2d3e04e0fe8b4e68",
            client_secret: "61xilx6nGiX4LcE8JXeocsLhLV",
            username: "denis.messie+netatmoapp@gmail.com",
            password: "{S)[#X7NT/a'rrWG",
            grant_type: 'password'
        }
    }).then(function(data) {
        accessToken = JSON.parse(data).access_token;
        return request({
            method : 'POST',
            uri: 'https://api.netatmo.com/api/getstationsdata?access_token=' + accessToken
        });
    }).then(function(data) {
        console.log('data received');

        let devices = JSON.parse(data).body.devices[0];
        let capt_ext = _.find(devices.modules, {_id: '02:00:00:13:42:00'});
        let capt_chambre = _.find(devices.modules, {_id: '03:00:00:03:94:9a'});
        let capt_bureau = _.find(devices.modules, {_id: '03:00:00:05:df:d2'});
        return {
            time: devices.last_status_store,
            ext: {
                temp: capt_ext.dashboard_data.Temperature,
                hum: capt_ext.dashboard_data.Humidity,
                temp_min: capt_ext.dashboard_data.min_temp,
                temp_max: capt_ext.dashboard_data.max_temp,
                temp_trend: capt_ext.dashboard_data.temp_trend
            },
            salon: {
                temp: devices.dashboard_data.Temperature,
                hum: devices.dashboard_data.Humidity,
                temp_min: devices.dashboard_data.min_temp,
                temp_max: devices.dashboard_data.max_temp,
                temp_trend: devices.dashboard_data.temp_trend,
                co2: devices.dashboard_data.CO2,
                noise: devices.dashboard_data.Noise
            },
            chambre: {
                temp: capt_chambre.dashboard_data.Temperature,
                hum: capt_chambre.dashboard_data.Humidity,
                temp_min: capt_chambre.dashboard_data.min_temp,
                temp_max: capt_chambre.dashboard_data.max_temp,
                temp_trend: capt_chambre.dashboard_data.temp_trend,
                co2: capt_chambre.dashboard_data.CO2
            },
            bureau: {
                temp: capt_bureau.dashboard_data.Temperature,
                hum: capt_bureau.dashboard_data.Humidity,
                temp_min: capt_bureau.dashboard_data.min_temp,
                temp_max: capt_bureau.dashboard_data.max_temp,
                temp_trend: capt_bureau.dashboard_data.temp_trend,
                co2: capt_bureau.dashboard_data.CO2
            }
        }
    });
}




