[![npm](https://img.shields.io/npm/v/avrecord.svg)](https://www.npmjs.com/package/avrecord)
[![npm](https://img.shields.io/npm/dm/avrecord.svg)](https://www.npmjs.com/package/avrecord)

# avrecord
A very primitive Video / Audio rotating recording (mainly for WebCam) script. It records forever (until you Ctrl-C) by intervals (default 2 hours), removes old recordings (default older than 7 days). It should be reliable to run by 24 * 7.

# Requirements
- node.js
- avconv (`sudo apt-get install libav-tools`)
- 80GB freed disk storage (This is a convervative estimation for the default configuration, you can tweak the config parameters to decrease the recording size / days to keep the files, etc)

# Installation
`sudo npm install -g avrecord`

# Configuration
- Create a file named `avrecord.json` in your recording directory with the following format (please refer to the `var config` definition in `avrecord.js`) and change the values (especially the input stream address and input streaming format):
```
var config = {
  prog: 'avconv',
  params: '-f mjpeg -i http://192.168.1.33:8080/video -c:v mpeg4 -b:v 400k -c:a libmp3lame -b:a 64k -loglevel warning',
  durationInMinutes: 120,
  daysToKeep: 7,
  delaySecondsOnError: 30
};
```

# Run
- (cd to your video archive directory)
- `avrecord`
