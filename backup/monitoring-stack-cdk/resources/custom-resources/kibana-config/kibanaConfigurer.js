// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const aws = require('aws-sdk');
const fs = require('fs');
const FormData = require('form-data');
const { send } = require('process');
const { EventEmitter } = require('events');

const region = process.env.AWS_REGION; // e.g. us-west-1

async function sendRequest(requestParams, domainName) {
  console.log(`Sending request to Elasticsearch: ${JSON.stringify(requestParams, 0, 4)}`);
  const request = new aws.HttpRequest(new aws.Endpoint(domainName), region);
  request.method = requestParams.method;
  request.headers = requestParams.headers;
  request.path += requestParams.path;
  request.body = requestParams.body;

  const credentials = new aws.EnvironmentCredentials('AWS');
  const signer = new aws.Signers.V4(request, 'es');
  signer.addAuthorization(credentials, new Date());

  const client = new aws.HttpClient();
  return new Promise((resolve, reject) => {
    client.handleRequest(request, null, (response) => {
      console.log(`${response.statusCode} ${response.statusMessage}`);
      let responseBody = '';
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        console.log(`Response body: ${responseBody}`);
        resolve(responseBody);
      });
    }, (error) => {
      console.log(`Error: ${error}`);
      reject(error);
    });
  });
}

async function createIndices(domainName) {
  const softphoneStreamStatsIndex = {
    method: 'PUT',
    headers: {
      host: domainName,
      'Content-Type': 'application/json;charset=UTF-8',
      Accept: 'application/json',
    },
    path: '_ingest/pipeline/stats_dailyindex',
    body: Buffer.from(JSON.stringify({
      description: 'daily date-time stream metrics index naming',
      processors: [
        {
          date_index_name: {
            field: 'doc.timestamp',
            index_name_prefix: 'softphonestreamstats-',
            date_rounding: 'd',
          },
        },
      ],
    })),
  };

  //force lambda update
  const softphoneReportStatsIndex = {
    method: 'PUT',
    headers: {
      host: domainName,
      'Content-Type': 'application/json;charset=UTF-8',
      Accept: 'application/json',
    },
    path: '_ingest/pipeline/reports_dailyindex',
    body: Buffer.from(JSON.stringify({
      description: 'daily date-time report index naming',
      processors: [
        {
          date_index_name: {
            field: 'doc.report.callEndTime',
            index_name_prefix: 'softphonecallreport-',
            date_rounding: 'd',
          },
        },
      ],
    })),
  };

  const apiMetricsIndex = {
    method: 'PUT',
    headers: {
      host: domainName,
      'Content-Type': 'application/json;charset=UTF-8',
      Accept: 'application/json',
    },
    path: '_ingest/pipeline/apimetrics_dailyindex',
    body: Buffer.from(JSON.stringify({
      description: 'daily date-time api metric index naming',
      processors: [
        {
          date_index_name: {
            field: 'doc.timestamp',
            index_name_prefix: 'apimetric-',
            date_rounding: 'd',
          },
        },
      ],
    })),
    }

  const softphoneStreamStatsIndexTemplate = {
    method: 'PUT',
    headers: {
      host: domainName,
      'Content-Type': 'application/json;charset=UTF-8',
      Accept: 'application/json',
    },
    path: '_template/streamstatstemplate',
    body: Buffer.from(JSON.stringify({
      "index_patterns": ["softphonestreamstats-*"],
      "template": {
        "settings": {
          "number_of_shards": 2
        }
      }
    }))
  }

  const apiMetricsIndexTemplate = {
    method: 'PUT',
    headers: {
      host: domainName,
      'Content-Type': 'application/json;charset=UTF-8',
      Accept: 'application/json',
    },
    path: '_template/apimetrictemplate',
    body: Buffer.from(JSON.stringify({
      "index_patterns": ["apimetric-*"],
      "template": {
        "settings": {
          "number_of_shards": 1
        }
      }
    }))
  }

  const indexConfigurations = [
    apiMetricsIndexTemplate,
    softphoneStreamStatsIndexTemplate,
    apiMetricsIndex,
    softphoneReportStatsIndex,
    softphoneStreamStatsIndex,
  ];

  /* complete requests in parallel */
  return Promise.all(indexConfigurations.map((curIndex) => sendRequest(curIndex, domainName)));
}

async function configureHighCardinalityAnomalyDetection(domainName) {
  const detectorName = "agent-call-quality-detector"
  const createDetector = {
    method: 'POST',
    headers: {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      "content-type": "application/json;charset=UTF-8",
      "kbn-version": "7.9.1",
      "pragma": "no-cache",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      host: domainName
    },
    path: '_plugin/kibana/api/anomaly_detectors/detectors',
    body: Buffer.from(JSON.stringify({
      "name": detectorName,
      "description":"Detects network metric anomalies for individual agents that may impact call quality.",
      "timeField":"doc.timestamp",
      "indices":["softphonestreamstats*"],
      "filterQuery": { match_all: { boost: 1 } },
      "uiMetadata":{"filterType":"simple_filter","filters":[],"features":{}},
      "detectionInterval":{"period":{"interval":2,"unit":"MINUTES"}},
      "windowDelay":{"period":{"interval":1,"unit":"MINUTES"}},
      featureAttributes: [
        {
          featureName: 'round-trip-time',
          featureEnabled: true,
          importance: 1,
          aggregationQuery: {
              round_trip_time: {
                  avg: {
                      field: "doc.roundTripTimeMillis"
                  }
              }
          }
        },
        {
          featureName: 'jitter',
          featureEnabled: true,
          importance: 1,
          aggregationQuery: {
              jitter: {
                  avg: {
                      field: "doc.jitterBufferMillis"
                  }
              }
          }
        },
        {
          featureName: 'packet-loss',
          featureEnabled: true,
          importance: 1,
          aggregationQuery: {
              packet_loss: {
                  avg: {
                      field: "doc.packetsLost"
                  }
              }
          }
        }
      ],
      categoryField: [ 'doc.agent.keyword' ],
      ui_metadata : {
      "features" : {
          "jitter" : {
            "aggregationBy" : "avg",
            "aggregationOf" : "doc.jitterBufferMillis",
            "featureType" : "simple_aggs"
          },
          "packet-loss" : {
            "aggregationBy" : "avg",
            "aggregationOf" : "doc.packetsLost",
            "featureType" : "simple_aggs"
          },
          "round-trip-time" : {
            "aggregationBy" : "avg",
            "aggregationOf" : "doc.roundTripTimeMillis",
            "featureType" : "simple_aggs"
          }
        }
      }
    }))
  }

  const detectorInfo = JSON.parse(await sendRequest(createDetector, domainName));
  if(!detectorInfo.ok) {
    throw new Error(detectorInfo.error);
  }
  console.log(detectorInfo);
  
  const startDetector = {
    method: 'POST',
    headers: {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      "content-type": "application/json;charset=UTF-8",
      "kbn-version": "7.9.1",
      "pragma": "no-cache",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      host: domainName
    },
    path: `_plugin/kibana/api/anomaly_detectors/detectors/${detectorInfo.response.id}/start`,
    body: Buffer.from(JSON.stringify({
      detectorId: detectorInfo.response.id
    }))
  }
  
  const enableDetectorResult = JSON.parse(await sendRequest(startDetector, domainName));
  console.log(JSON.stringify(enableDetectorResult));
  if(!enableDetectorResult.ok)
    throw new Error(enableDetectorResult.error)
}

async function addSampleStreamRecord(domainName) {
  var recordBody = {
    "doc":{
        "contactId": "173518a4-9d74-452d-a83c-0f652e7f422d",
        "agent": "sample",
        "agentPrivateIp": "cb68c546-50ff-4c8b-b227-083670ab8d82.local",
        "agentPublicIp": "205.251.233.178",
        "agentRoutingProfile": "Basic Routing Profile",
        "signalingEndpoint": "wss://rtc.connect-telecom.us-east-1.amazonaws.com/LilyRTC",
        "iceServers": "turn:turnnlb-d76454ac48d20c1e.elb.us-east-1.amazonaws.com.:3478",
        "contactQueue": "BasicQueue",
        "softphoneStreamType": "audio_input",
        "timestamp": "2020-09-24T23:45:43.278Z",
        "packetsLost": 0,
        "packetsCount": 17,
        "audioLevel": 15,
        "jitterBufferMillis": 2,
        "roundTripTimeMillis": null
    }
  }
  var recordBuffer = Buffer.from(JSON.stringify(recordBody));
  const sampleRecord = {
    method: 'POST',
    path: `softphonestreamstats-/_doc?pipeline=stats_dailyindex`,
    headers: {
      host: domainName,
      'Content-Type': 'application/json',
    },
    body: recordBuffer
  }
  var result = await sendRequest(sampleRecord, domainName);
  console.log(result);
}

/*async function addStreamStatsIndex(domainName) {
  const sampleRecord = {
    method: 'PUT',
    path: `softphonestreamstats-`,
    headers: {
      host: domainName,
    },
  }
  sendRequest(sampleRecord, domainName)
}*/

async function configureKibana(domainName) {
  const body = new FormData();
  body.append('file', fs.readFileSync('./export.ndjson', 'utf8'), 'export.ndjson');
  const kibanaImportRequestParams = {
    method: 'POST',
    headers: {
      ...body.getHeaders(),
      'kbn-xsrf': 'kibana',
      host: domainName,
    },
    path: '_plugin/kibana/api/saved_objects/_import?overwrite=true',
    body: body.getBuffer(),
  };
  return sendRequest(kibanaImportRequestParams, domainName);
}

exports.handler = async (event, context) => {
  console.log(JSON.stringify(event, 0, 4));
  if(event.RequestType !== 'Delete') {
    const domainName = event.ResourceProperties.ElasticsearchDomain;
    const indexCreationResult = await createIndices(domainName);
    const resultSet = new Set(indexCreationResult);
    if (resultSet.has('{"acknowledged":true}') && resultSet.size === 1) {
      const kibanaImportResult = await configureKibana(domainName);
      if (JSON.parse(kibanaImportResult).success) {
        await addSampleStreamRecord(domainName);
        await new Promise(resolve => setTimeout(resolve, 10000));
        if(event.RequestType == 'Create') {
          await configureHighCardinalityAnomalyDetection(domainName);
        }
        return { statusCode: 200, body: 'Successfully imported dashboards and indices' };
      }
      throw new Error('Unable to import dashboards');
    }
    throw new Error('Creating index patterns was not successful. Check logs for details.');
  }
};
