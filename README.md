## netatmo image generation for display on e-ink screen

Weather forecast data come from darksky and meteoblue. Webservices call is set for Grenoble, France. You have to modify darksky_ws.js and meteoblue_ws.js to get forecast for your location.

For netatmo part, data is a little bit hardcoded to my netatmo setup : see the end of index.js script. You have to modify It to match your setup. All labels are in french. 

To run the script, create auth.json (see below) and  type `node index.js` .
The script generates a file named out.bmp, and then call modified python script from waveshare to display this bitmap to e-ink screen. After this, the script keeps running and will automatically refresh screen when a significant change is detected. 

this script is meant to be used on raspberry pi with waveshare e-ink display : https://www.waveshare.com/wiki/7.5inch_e-Paper_HAT_(B) 
I have plugged a led to GPIO to show user that the display is currently refreshing (see led.js file)


You must create a auth.json file on project root with this data : 
```json
{
  "netatmo" : {
    "client_id": "your client id",
    "client_secret": "your client secret",
    "username": "your netatmo user email",
    "password": "your netatmo password"
  },
  "darksky" : {
    "secret" : "your darksky secret"
  }
}
```

for testing purpose, you can run this script on any computer by creating a file named "debug" on project root. If this file exists, image is generated but not displayed to e-ink display. 

The result on screen should look like that :

![example](/example.png)
