const bmp_lib = require('bitmap-manipulation');
const path = require('path');


let bitmap = new bmp_lib.BMPBitmap(640,384);
let palette = bitmap.palette;
bitmap.clear(palette.indexOf(0xffffff));

bitmap.drawFilledRect(0,0,159,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
bitmap.drawFilledRect(161,0,158,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
bitmap.drawFilledRect(321,0,158,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
bitmap.drawFilledRect(481,0,159,20, palette.indexOf(0x000000),  palette.indexOf(0x000000));
bitmap.drawFilledRect(0,20  ,640,1, palette.indexOf(0xff0000), null);
drawDotLine(bitmap,159, 20,364);
drawDotLine(bitmap,319, 20,364);
drawDotLine(bitmap,479, 20,364);
//bitmap.drawFilledRect(159, 20, 2, 364, palette.indexOf(0x000000), null);
//bitmap.drawFilledRect(319, 20, 2, 364, palette.indexOf(0x000000), null);
//bitmap.drawFilledRect(479, 20, 2, 364, palette.indexOf(0x000000), null);
//bitmap.drawFilledRect(0,20,640,2, palette.indexOf(0xff0000), null);


let font =  new bmp_lib.Font(path.join(__dirname,'font/proxima.json'));

font.setSize(18);
font.setColor(palette.indexOf(0xffffff));
bitmap.drawText(font, "EXTÉRIEUR",15 , 1);
bitmap.drawText(font, "SÉJOUR",175 , 1);
bitmap.drawText(font, "CHAMBRE",335 , 1);
bitmap.drawText(font, "BUREAU",495 , 1);


font.setSize(36);
font.setColor(palette.indexOf(0x000000));
bitmap.drawText(font, "10.4°C", 15, 25);
bitmap.drawText(font, "67%", 15, 65);

bitmap.drawText(font, "21.3°C", 175, 25);
bitmap.drawText(font, "53%", 175, 65);
bitmap.drawFilledRect(161,105  ,158,40, null , palette.indexOf(0xff0000));
bitmap.drawText(font, "1200ppm", 175, 105);
bitmap.drawText(font, "61dB", 175, 145);

bitmap.drawText(font, "18.9°C", 335, 25);
bitmap.drawText(font, "58%", 335, 65);
bitmap.drawText(font, "1200ppm", 335, 105);

//bitmap.drawText(font, "Hello World!", 1, 25);



function drawDotLine(bitmap,  left,top, height) {
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


bitmap.save('out.bmp');