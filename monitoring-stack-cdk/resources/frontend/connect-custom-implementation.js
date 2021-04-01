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
  loginPopupAutoClose: true,
  loginOptions: {                 // optional, if provided opens login in new window
    autoClose: true,              // optional, defaults to `false`
    height: 600,                  // optional, defaults to 578
    width: 400,                   // optional, defaults to 433
    top: 0,                       // optional, defaults to 0
    left: 0                       // optional, defaults to 0
  },
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

function strictNumber(metric) {
  //converts string to a number and handles NaN -> 0
  //this prevents multiple edge cases that break the API GW mapping template
  return Number(metric) || 0;
}

function subscribeToTelmetryEvents() {
  subscribeToSoftphoneMetrics();
  subscribeToCallReports();
  subscribeToApiMetrics();
}

function subscribeToApiMetrics() {
  connect.core.getEventBus().subscribe(connect.EventType.API_METRIC, (event) => {
    console.log(JSON.stringify(event));
    const date = new Date();
    const timestamp = date.toJSON();
    event.timestamp = timestamp;
    metriclist.push(event);
  });
}
function subscribeToSoftphoneMetrics() {
  connect.core.getEventBus().subscribe(connect.EventType.SOFTPHONE_STATS, (streamStats) => {
    const currentAgent = new connect.Agent();
    const contactMediaInfo = currentAgent.getContacts()[0].getAgentConnection().getMediaInfo();
    const callConfig = contactMediaInfo.callConfigJson;
    const metricsJson = {
      agentPrivateIp: localIp,
      callConfigJson: callConfig,
      agentRoutingProfile: currentAgent.getRoutingProfile().name,
      contactId: currentAgent.getContacts()[0].getContactId(),
      contactQueue: currentAgent.getContacts()[0].getQueue().name,
      softphoneStreamStatistics: cleanStreamStatsData(streamStats.stats),
    };
    console.log('Sending softphone metric data to ElasticSearch');
    esApiGatewayRequest('POST', 'softphonemetrics', metricsJson);
  });
}

function cleanStreamStatsData(streamStats) {
  return streamStats.map(statEntry => {
    statEntry.packetsLost = strictNumber(statEntry.packetsLost);
    statEntry.packetsCount = strictNumber(statEntry.packetsCount);
    statEntry.audioLevel = strictNumber(statEntry.audioLevel);
    statEntry.jitterBufferMillis = strictNumber(statEntry.jitterBufferMillis);
    statEntry.roundTripTimeMillis = strictNumber(statEntry.roundTripTimeMillis);
    return statEntry;
  })
}

function subscribeToCallReports() {
  connect.core.getEventBus().subscribe(connect.EventType.SOFTPHONE_REPORT, (report) => {
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
      ...report
    };
    console.log('Sending softphone call report data to ElasticSearch');
    esApiGatewayRequest('POST', 'callreport', callReportJson);
  })
}

function initCustomImplementation(div, apiUrl) {
  if(apiUrl && apiUrl != undefined) {
    window.apiUrl = apiUrl;
  }
  if (!window.connect.core.initialized) {
    connect.core.initCCP(div, ccpParams);
  }
  connect.core.initSoftphoneManager({ allowFramedSoftphone: true });
  connect.agent(subscribeToAgentEvents);
  subscribeToTelmetryEvents();
}

// If the script was loaded with the ccpUrl attribute, we are likely using the
// generated Custom CCP
if(document.currentScript.getAttribute('ccpUrl')) {
  initCustomImplementation(containerDiv, window.apiUrl);
}