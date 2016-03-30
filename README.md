[![npm](https://img.shields.io/npm/v/avrecord.svg)](https://www.npmjs.com/package/avrecord)
[![npm](https://img.shields.io/npm/dm/avrecord.svg)](https://www.npmjs.com/package/avrecord)

# avrecord
A very primitive Video / Audio rotating recording (mainly for WebCam) script. It records forever (until you Ctrl-C) by intervals (default 2 hours), removes old recordings (default older than 7 days). It should be reliable to run on 24 * 7.

# Requirements
- node.js
- avconv (`sudo apt-get install libav-tools`)

# Run
`node index.js`
