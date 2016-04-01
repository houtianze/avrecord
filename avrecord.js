#!/usr/bin/env node

'use strict';

// imports
var fs = require('fs');
var util = require('util');
var proc = require('child_process');

// constants
var ConfigFile = 'avrecord.json';

// library functions
var logit = console.log

// globals
var config = {
  prog: 'avconv',
  params: '-f mjpeg -i http://192.168.1.33:8080/video -f wav -i http://192.168.1.33:8080/audio.wav -c:v mpeg4 -b:v 400k -c:a libmp3lame -b:a 64k -loglevel warning',
  durationInMinutes: 120,
  sentinelGraceInMinutes: 15,
  daysToKeep: 7,
  delaySecondsOnError: 30
};

var stopRecording = false;
var recordingProc = null;
var recordingStartTime = null;
var delayedRecordingId = null;
var guaranteedTerminationId = null;

function prependzero(num, digits) {
  digits = digits || 2
  var ns = num.toString()
  var len = ns.length;
  if (len < digits) {
    var ns = Array(digits - len + 1).join('0').toString() + ns;
  }
  return ns;
}

function ms2timestr(ms, keepms) {
  var str = '';
  if (typeof keepms != 'undefined' && keepms) {
    str = '.'  + prependzero(ms % 1000, 3);
  }
  // http://stackoverflow.com/questions/4228356/integer-division-in-javascript
  var s = (ms / 1000) | 0;
  if (s <= 0) {
    return str;
  }
  var sp = s % 60;
  var m = (s / 60) | 0;
  if (m <= 0) {
    return sp + str;
  }
  str = prependzero(sp) + str;
  var mp = m % 60;
  var h = (m / 60) | 0;
  if (h <= 0) {
    return mp + ':' + str;
  }
  str = prependzero(mp) + ':' + str;
  var hp = h % 24;
  var d = (h / 24) | 0;
  if (d <= 0) {
    return h + ':' + str;
  }
  return d + 'd' + prependzero(h) + ':' + str;
}

function getTimestampStr(date) {
  return date.getFullYear() + '-' +
    prependzero(date.getMonth() + 1) + '-' +
    prependzero(date.getDate()) + '_' +
    prependzero(date.getHours()) + '.' +
    prependzero(date.getMinutes()) + '.' +
    prependzero(date.getSeconds()) + '_' +
    prependzero(date.getMilliseconds(), 3);
}

function logtag(tag, msg) {
  var now = new Date();
  var past = '';
  if (recordingStartTime) {
    past = ' (' +  ms2timestr(now.getTime() - recordingStartTime.getTime()) + ')';
  }
  logit(`${tag}: ${getTimestampStr(now)}${past}: ${msg}`);
}

function logerr(msg) {
  logtag('ERROR', msg);
}

function logwarn(msg) {
  logtag('WARN ', msg);
}

function loginfo(msg) {
  logtag('INFO ', msg);
}

function constructVideoFileName(date) {
  return getTimestampStr(date) + '.avi';
}

function removeOldRecords(err, files) {
  var ReVideo = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})\.(\d{2})\.(\d{2})_(\d{3})\.avi$/;
  files.forEach((f) => {
    //fs.stat(f, ((err, stats) => { // seems this binding is not needed
    fs.stat(f, (err, stats) => {
      //var f = this;
      //loginfo(`File: ${f}`);
      if (err) {
        logerr(`stat failed on file '${f}'`);
      } else {
        var rr = ReVideo.exec(f);
        if (rr != null) {
          var fileDate = new Date();
          var now = new Date();
          fileDate.setFullYear(rr[1]);
          fileDate.setMonth(rr[2] - 1);
          fileDate.setDate(rr[3]);
          fileDate.setHours(rr[4]);
          fileDate.setMinutes(rr[5]);
          fileDate.setSeconds(rr[6]);
          fileDate.setMilliseconds(rr[7]);
          if (now.getTime() - fileDate.getTime() > config.daysToKeep * 24 * 60 * 60 * 1000) {
            loginfo(`Removing the old file ${f}`);
            fs.unlink(f);
          }
        }
      }
    });
    //}).bind(f)); // seems this binding is not needed
  });
}

function sentinel() {
  logerr("Recording process failed to exit in the given duration "
    + `(${config.durationInMinutes} minnutes), killing now ...`);
  recordingProc.kill('SIGINT');
  loginfo("Recording process killed");
}

function spawnRecordingProc() {
  var now = new Date();
  recordingStartTime = now;
  var filename = constructVideoFileName(now);
  loginfo(`Recording file: ${filename}`);
  var cmdline = config.prog +
    ' ' + config.params +
    ' -t ' + config.durationInMinutes * 60 +
    ' ' + filename;
  loginfo(`Command: ${cmdline}`);
  recordingProc = proc.exec(cmdline);

  recordingProc.stdout.on('data', (data) => { logtag('PROCO', `${data}`) });
  recordingProc.stderr.on('data', (data) => { logtag('PROCE', `${data}`) });
  recordingProc.on('close', recordnew);

  // in case of rare occassions, if avconv doesn't quit after the specified
  // recording duration, we terminate it proactively. we want it to be reliable.
  if (guaranteedTerminationId != null) {
    clearTimeout(guaranteedTerminationId);
  }
  guaranteedTerminationId = setTimeout(sentinel,
    (config.durationInMinutes + config.sentinelGraceInMinutes) * 60 * 1000);
}

function recordnew(code, signal, firstrun) {
  if (!firstrun) {
    loginfo(`Recording process exited with code ${code}, singal ${signal}`);
  }

  if (stopRecording) {
    return 0;
  }

  fs.readdir('.', removeOldRecords);

  if (code == 0) {
    spawnRecordingProc();
  } else {
    recordingStartTime = null;
    logerr(`Last recording erred, so we delay ${config.delaySecondsOnError} seconds before recording again`);
    if (delayedRecordingId != null) {
      clearTimeout(delayedRecordingId);
    }
    delayedRecordingId = setTimeout(spawnRecordingProc, config.delaySecondsOnError * 1000);
  }
}

// the orchestrator
function record() {
  loginfo(`Config: ${util.inspect(config)}`);
  recordnew(0, null, true);
}

function parseConfig(err, data) {
  if (err) {
    logerr(`Error reading config file '${ConfigFile}': ${err}`);
    loginfo("Using the default config");
  } else {
    try {
      var userConfig = JSON.parse(data);
      // merge
      for (var prop in userConfig) {
        config[prop] = userConfig[prop];
      }
    } catch (ex) {
      logerr(`Error parsing config file '${ConfigFile}' - Exception: ${ex}`);
      loginfo("Using the default config");
    }
  }

  record();
}

function checkConfigExists(err, stats) {
  if (err) {
    logerr(`Error stating the config file '${ConfigFile}': ${err}`);
    loginfo("Using the default config");
    record();
  } else {
    if (stats.isFile) {
      fs.readFile(this, {encoding: 'utf-8', flag: 'r'}, parseConfig);
    } else {
      logerr(`Config file '${ConfigFile}' is not a regular file`);
      loginfo("Using the default config");
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

      if (guaranteedTerminationId != null) {
        clearTimeout(guaranteedTerminationId);
      }

      stopRecording = true;
      loginfo("Keyboard interrupt received, killing the recording process ...");
      recordingProc.kill('SIGINT');
      loginfo("Recording process killed.");
    }
  });

  fs.stat(ConfigFile, checkConfigExists.bind(ConfigFile));
}

// +++ Not really used +++
function saveConfig() {
  fs.writeFile(ConfigFile, JSON.stringify(config), (err) => {
   if (err) {
    throw err;
   }
  });
}
// --- Not really used ---

// +++ Unit Testing +++
function assert(condition, message) {
  if (!condition) {
    throw message || 'Assertion';
  }
}

function unittest() {
  logit(prependzero(123, 4));
  assert(prependzero(123, 4) === '0123');
}
// --- Unit Testing ---

if (require.main == module) {
  if (process.argv.length === 3 && process.argv[2] == '-T') {
    unittest();
  } else {
    main();
  }
}

module.exports = {
  record: main,
  unittest: unittest
};
