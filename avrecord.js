#!/usr/bin/env node

'use strict';

// imports
const fs = require('fs');
const util = require('util');
const proc = require('child_process');

// constants
const ConfigFile = 'avrecord.json';

// globals
var config = {
  prog: 'avconv',
  params: '-f mjpeg -i http://192.168.1.33:8080/video -c:v mpeg4 -b:v 400k -c:a libmp3lame -b:a 64k -loglevel warning',
  durationInMinutes: 120,
  daysToKeep: 7,
  delaySecondsOnError: 30
};

var stopRecording = false;
var recordingProc = null;
var delayedRecordingId = null;

function saveConfig() {
  fs.writeFile(ConfigFile, JSON.stringify(config), (err) => {
   if (err) {
    throw err;
   }
  });
}

// +++ Unit Testing +++
function assert(condition, message) {
  if (!condition) {
    throw message || 'Assertion';
  }
}

function unittest() {
  console.log(prependzero(123, 4));
  assert(prependzero(123, 4) === '0123');
}

// --- Unit Testing ---

function prependzero(num, digits) {
  digits = digits || 2
  var ns = num.toString()
  var len = ns.length;
  if (len < digits) {
    var ns = Array(digits - len + 1).join('0').toString() + ns;
  }
  return ns;
}

function constructVideoFileName(date) {
  const filename = date.getFullYear() + '-' +
    prependzero(date.getMonth() + 1) + '-' +
    prependzero(date.getDate()) + '_' +
    prependzero(date.getHours()) + '.' +
    prependzero(date.getMinutes()) + '.' +
    prependzero(date.getSeconds()) + '_' +
    prependzero(date.getMilliseconds(), 3) + '.avi';
  return filename;
}

function removeOldRecords(err, files) {
  const ReVideo = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})\.(\d{2})\.(\d{2})_(\d{3})\.avi$/;
  files.forEach((f) => {
    //fs.stat(f, ((err, stats) => { // seems this binding is not needed
    fs.stat(f, (err, stats) => {
      //var f = this;
      //console.log(`File: ${f}`);
      if (err) {
        console.error(`stat failed on file '${f}'`);
      } else {
        var rr = ReVideo.exec(f);
        if (rr != null) {
          var fileDate = new Date();
          var now = new Date();
          fileDate.setFullYear(rr[1]);
          fileDate.setMonth(rr[2] - 1);
          fileDate.setDay(rr[3]);
          fileDate.setHours(rr[4]);
          fileDate.setMinutes(rr[5]);
          fileDate.setSeconds(rr[6]);
          fileDate.setMilliseconds(rr[7]);
          if (now.getTime() - fileDate.getTime() > config.daysToKeep * 24 * 60 * 60 * 1000) {
            console.log(`Removing the old file ${f}`);
            fs.unlink(f);
          }
        }
      }
    });
    //}).bind(f)); // seems this binding is not needed
  });
}

function spawnRecordingProc() {
  const now = new Date();
  const filename = constructVideoFileName(now);
  console.log(`Recording file: ${filename}`);
  var cmdline = config.prog +
    ' ' + config.params +
    ' -t ' + config.durationInMinutes * 60 +
    ' ' + filename;
  console.log(`Command: ${cmdline}`);
  recordingProc = proc.exec(cmdline);

  recordingProc.stdout.on('data', (data) => { console.log(`${data}`) } );
  recordingProc.stderr.on('data', (data) => { console.error(`${data}`) });
  recordingProc.on('close', recordnew);
}

function recordnew(code, signal, firstrun) {
  if (!firstrun) {
    console.log(`Recording process exited with code ${code}, singal ${signal}`);
  }

  if (stopRecording) {
    return 0;
  }

  fs.readdir('.', removeOldRecords);

  if (code == 0) {
    spawnRecordingProc();
  } else {
    console.error(`Last recording erred, so we delay ${config.delaySecondsOnError} seconds before recording again`);
    delayedRecordingId = setTimeout(spawnRecordingProc, config.delaySecondsOnError * 1000);
  }
}

// the orchestrator
function record() {
  console.log(`Config: ${util.inspect(config)}`);
  recordnew(0, null, true);
}

function parseConfig(err, data) {
  if (err) {
    console.error(`Error reading config file '${ConfigFile}': ${err}`);
    console.log("Using the default config");
  } else {
    try {
      config = JSON.parse(data);
    } catch (ex) {
      console.log(`Error parsing config file '${ConfigFile}' - Exception: ${ex}`);
      console.log("Using the default config");
    }
  }

  record();
}

function checkConfigExists(err, stats) {
  if (err) {
    console.log(`Error stating the config file '${ConfigFile}': ${err}`);
    console.log("Using the default config");
    record();
  } else {
    if (stats.isFile) {
      fs.readFile(this, {encoding: 'utf-8', flag: 'r'}, parseConfig);
    } else {
      console.log(`Config file '${ConfigFile}' is not a regular file`);
      console.log("Using the default config");
      record();
    }
  }
}

function main() {
  process.on('SIGINT', () => {
    if (recordingProc) {
      if (delayedRecordingId != null) {
        clearTimeout(delayedRecordingId);
      }
      stopRecording = true;
      console.log("Keyboard interrupt received, killing the recording process ...");
      recordingProc.kill('SIGINT');
      console.log("Recording process killed.");
    }
  });

  fs.stat(ConfigFile, checkConfigExists.bind(ConfigFile));
}

if (require.main == module) {
  //unittest();
  main();
}

module.exports = {
  record: main
};
