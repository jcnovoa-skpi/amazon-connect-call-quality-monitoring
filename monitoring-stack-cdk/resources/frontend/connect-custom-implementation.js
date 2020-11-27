// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
window.myCPP = window.myCPP || {};
window.agentHierarchy = window.agentHierarchy || {};
window.apiUrl = document.currentScript.getAttribute('apiGatewayUrl');
const ccpUrl = document.currentScript.getAttribute('ccpUrl');
const samlUrl = document.currentScript.getAttribute('samlUrl');
const instanceRegion = document.currentScript.getAttribute('region');
const ccpParams = {
  ccpUrl,
  loginPopup: true,
  softphone: {
    allowFramedSoftphone: false,
  },
  region: instanceRegion,
};
// If the instance is a SAML instance, loginUrl must be set to pop the login
if (samlUrl && samlUrl !== 'undefined' && samlUrl !== '') {
  ccpParams.loginUrl = samlUrl;
}
let browserName;
let versionString;
let version;
let localIp = '';

let metriclist = [];

if ((navigator.userAgent.indexOf('Chrome')) !== -1) {
  browserName = 'Chrome';
  versionString = navigator.userAgent.substring(
    navigator.userAgent.indexOf(browserName) + browserName.length + 1,
  );
  version = versionString.substring(0, versionString.indexOf(' '));
} else if ((navigator.userAgent.indexOf('Firefox')) !== -1) {
  browserName = 'Firefox';
  versionString = navigator.userAgent.substring(
    navigator.userAgent.indexOf(browserName) + browserName.length + 1,
  );
  version = versionString;
}
function getLocalIP() {
  return new Promise((resolve, reject) => {
    const RTCPeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    if (!RTCPeerConnection) {
      reject(new Error('Your browser does not support this API'));
    }
    const rtc = new RTCPeerConnection({ iceServers: [] });
    const addrs = {};
    addrs['0.0.0.0'] = false;
    function grepSDP(sdp) {
      let finalIP = '';
      sdp.split('\r\n').forEach((line) => { // c.f. http://tools.ietf.org/html/rfc4566#page-39
        if (~line.indexOf('a=candidate')) { // http://tools.ietf.org/html/rfc4566#section-5.13
          const parts = line.split(' '); // http://tools.ietf.org/html/rfc5245#section-15.1
          const addr = parts[4];
          const type = parts[7];
          if (type === 'host') {
            finalIP = addr;
          }
        } else if (~line.indexOf('c=')) { // http://tools.ietf.org/html/rfc4566#section-5.7
          const parts = line.split(' ');
          const addr = parts[2];
          finalIP = addr;
        }
      });
      return finalIP;
    }

    if (1 || window.mozRTCPeerConnection) { // FF [and now Chrome!] needs a channel/stream
      rtc.createDataChannel('', { reliable: false });
    }

    rtc.onicecandidate = (evt) => {
      // convert the candidate to SDP so we can run it through our general parser
      // see https://twitter.com/lancestout/status/525796175425720320 for details
      if (evt.candidate) {
        const addr = grepSDP(`a=${evt.candidate.candidate}`);
        resolve(addr);
      }
    };
    rtc.createOffer((offerDesc) => {
      rtc.setLocalDescription(offerDesc);
    }, (e) => { console.warn('offer failed', e); });
  });
}

getLocalIP().then((data) => { localIp = data; });

function esApiGatewayRequest(httpVerb, endpoint, jsonForEvent) {
  const xhr = new XMLHttpRequest();
  xhr.open(httpVerb, `${window.apiUrl}${endpoint}`, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  if (jsonForEvent && jsonForEvent !== 'undefined' && jsonForEvent !== null) {
    xhr.send(JSON.stringify({
      ...jsonForEvent,
      agent: new connect.Agent().getConfiguration().username
    }));
  } else {
    xhr.send();
  }
  return xhr;
}

function subscribeToAgentEvents(agent) {
  console.log(agent);
  console.log(`Agent ${agent.getName()} logged in to Connect`);
  // Close login popup
  const w = window.open('', connect.MasterTopics.LOGIN_POPUP);
  if (typeof w !== 'undefined' && w) {
    console.log('Closing SAML popup');
    w.close();
  }
  // Every 30 seconds send API metrics
  window.setInterval(() => {
    console.log('Sending api metric data to ElasticSearch');
    esApiGatewayRequest('POST', 'apimetrics', { API_METRIC: metriclist });
    metriclist = [];
  }, 30000);
}

const AUDIO_INPUT = 'audio_input';
const AUDIO_OUTPUT = 'audio_output';

let timeSeriesStreamStatsBuffer = [];
let aggregatedUserAudioStats = {};
let aggregatedRemoteAudioStats = {};
let rtpStatsJob = null;
let reportStatsJob = null;
const { SoftphoneErrorTypes } = connect;

function getTimeSeriesStats(currentStats, previousStats, streamType) {
  if (previousStats && currentStats) {
    const packetsLost = currentStats.packetsLost > previousStats.packetsLost
      ? currentStats.packetsLost - previousStats.packetsLost : 0;
    const packetsCount = currentStats.packetsCount > previousStats.packetsCount
      ? currentStats.packetsCount - previousStats.packetsCount : 0;
    return {
      timestamp: currentStats.timestamp,
      packetsLost: packetsLost,
      packetsCount: packetsCount,
      softphoneStreamType: streamType,
      audioLevel: currentStats.audioLevel,
      jitterBufferMillis: currentStats.jbMilliseconds,
      roundTripTimeMillis: currentStats.rttMilliseconds,
    };
  }
  return {
    timestamp: currentStats.timestamp,
    packetsLost: currentStats.packetsLost,
    packetsCount: currentStats.packetsCount,
    softphoneStreamType: streamType,
    audioLevel: currentStats.audioLevel,
    jitterBufferMillis: currentStats.jitterBufferMillis,
    roundTripTimeMillis: currentStats.roundTripTimeMillis,
  };
}

function startStatsCollectionJob(rtcSession) {
  rtpStatsJob = window.setInterval(() => {
    rtcSession.getUserAudioStats().then((stats) => {
      const previousUserStats = aggregatedUserAudioStats;
      aggregatedUserAudioStats = stats;
      timeSeriesStreamStatsBuffer.push(
        getTimeSeriesStats(aggregatedUserAudioStats, previousUserStats, AUDIO_INPUT),
      );
    }, (error) => {
      connect.rootLogger.debug('Failed to get user audio stats.', error);
    });
    rtcSession.getRemoteAudioStats().then((stats) => {
      const previousRemoteStats = aggregatedRemoteAudioStats;
      aggregatedRemoteAudioStats = stats;
      timeSeriesStreamStatsBuffer.push(
        getTimeSeriesStats(aggregatedRemoteAudioStats, previousRemoteStats, AUDIO_OUTPUT),
      );
    }, (error) => {
      connect.rootLogger.debug('Failed to get remote audio stats.', error);
    });
  }, 1000);
}

function sendSoftphoneMetrics() {
  const streamStats = timeSeriesStreamStatsBuffer.slice();
  timeSeriesStreamStatsBuffer = [];
  if (streamStats.length > 0) {
    const currentAgent = new connect.Agent();
    const contactMediaInfo = currentAgent.getContacts()[0].getAgentConnection().getMediaInfo();
    const callConfig = contactMediaInfo.callConfigJson;
    const metricsJson = {
      agentPrivateIp: localIp,
      callConfigJson: callConfig,
      agentRoutingProfile: currentAgent.getRoutingProfile().name,
      contactId: currentAgent.getContacts()[0].getContactId(),
      contactQueue: currentAgent.getContacts()[0].getQueue().name,
      softphoneStreamStatistics: streamStats,
    };
    console.log('Sending softphone metric data to ElasticSearch');
    esApiGatewayRequest('POST', 'softphonemetrics', metricsJson);
  }
}

function sendSoftphoneReport(report, userAudioStats, remoteAudioStats) {
  report.streamStats = [
    { ...userAudioStats, softphoneStreamType: AUDIO_INPUT },
    { ...remoteAudioStats, softphoneStreamType: AUDIO_OUTPUT },
  ];
  const callReport = {
    callStartTime: report.sessionStartTime,
    softphoneStreamStatistics: report.streamStats,
    callEndTime: report.sessionEndTime,
    gumTimeMillis: report.gumTimeMillis,
    initializationTimeMillis: report.initializationTimeMillis,
    iceCollectionTimeMillis: report.iceCollectionTimeMillis,
    signallingConnectTimeMillis: report.signallingConnectTimeMillis,
    handshakingTimeMillis: report.handshakingTimeMillis,
    preTalkingTimeMillis: report.preTalkingTimeMillis,
    talkingTimeMillis: report.talkingTimeMillis,
    cleanupTimeMillis: report.cleanupTimeMillis,
    iceCollectionFailure: report.iceCollectionFailure,
    signallingConnectionFailure: report.signallingConnectionFailure,
    handshakingFailure: report.handshakingFailure,
    gumOtherFailure: report.gumOtherFailure,
    gumTimeoutFailure: report.gumTimeoutFailure,
    createOfferFailure: report.createOfferFailure,
    setLocalDescriptionFailure: report.setLocalDescriptionFailure,
    userBusyFailure: report.userBusyFailure,
    invalidRemoteSDPFailure: report.invalidRemoteSDPFailure,
    noRemoteIceCandidateFailure: report.noRemoteIceCandidateFailure,
    setRemoteDescriptionFailure: report.setRemoteDescriptionFailure,
  };

  const currentAgent = new connect.Agent();
  const contactMediaInfo = currentAgent.getContacts()[0].getAgentConnection().getMediaInfo();
  const callConfig = contactMediaInfo.callConfigJson;
  const callReportJson = {
    agentPrivateIp: localIp,
    callConfigJson: callConfig,
    numberofCpu: window.navigator.hardwareConcurrency,
    localDeviceMemoryLimit: window.navigator.deviceMemory,
    agentBrowserName: browserName,
    agentBrowserversion: version,
    agentRoutingProfile: currentAgent.getRoutingProfile().name,
    contactQueue: currentAgent.getContacts()[0].getQueue().name,
    contactId: currentAgent.getContacts()[0].getContactId(),
    report: callReport,
  };
  console.log('Sending softphone call report data to ElasticSearch');
  esApiGatewayRequest('POST', 'callreport', callReportJson);
}

function stopJob(task) {
  if (task) {
    window.clearInterval(task);
  }
  return null;
}

function startStatsReportingJob() {
  reportStatsJob = window.setInterval(() => {
    sendSoftphoneMetrics();
  }, 30000);
}

function stopJobsAndReport(sessionReport) {
  console.log('stopJobsAndReport');
  rtpStatsJob = stopJob(rtpStatsJob);
  reportStatsJob = stopJob(reportStatsJob);
  sendSoftphoneReport(
    sessionReport,
    { ...aggregatedUserAudioStats, softphoneStreamType: AUDIO_INPUT },
    { ...aggregatedRemoteAudioStats, softphoneStreamType: AUDIO_OUTPUT }
  );
  sendSoftphoneMetrics();
}

function initCustomImplementation(div, apiUrl) {
  if(apiUrl && apiUrl != undefined) {
    window.apiUrl = apiUrl;
  }
  if (!window.connect.core.initialized) {
    connect.core.initCCP(div, ccpParams);
  }
  connect.core.initSoftphoneManager({ allowFramedSoftphone: true });
  connect.core.getEventBus().subscribe(connect.EventType.API_METRIC, (event) => {
    console.log(JSON.stringify(event));
    const date = new Date();
    const timestamp = date.toJSON();
    event.timestamp = timestamp;
    metriclist.push(event);
  });
  connect.core.onSoftphoneSessionInit(({ connectionId }) => {
    const softphoneManager = connect.core.getSoftphoneManager();
    if (softphoneManager) {
      // access session
      const session = softphoneManager.getSession(connectionId);
      console.log(`Session on init ${session}`);
      const agent = new connect.Agent();
      const contact = agent.getContacts()[0];
      console.log(`Contact on softphone session init ${contact}`);
      session.onSessionFailed = (rtcSession, reason) => {
        console.log(`Session failed for reason: ${reason}`);
        stopJobsAndReport(rtcSession.sessionReport);
      };
      session.onSessionConnected = (rtcSession) => {
        console.log(`Detected new session ${rtcSession}`);
        startStatsCollectionJob(rtcSession);
        startStatsReportingJob();
      };
      session.onSessionCompleted = (rtcSession) => {
        console.log(`Session completed ${rtcSession}`);
        stopJobsAndReport(rtcSession.sessionReport);
      };
    }
  });
  connect.agent(subscribeToAgentEvents);
}

// If the script was loaded with the ccpUrl attribute, we are likely using the
// generated Custom CCP
if(document.currentScript.getAttribute('ccpUrl')) {
  initCustomImplementation(containerDiv, window.apiUrl);
}