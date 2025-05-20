// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');
const https = require('https');
const { URL } = require('url');

// Get the OpenSearch domain endpoint from environment variables
const OPENSEARCH_DOMAIN_ARN = process.env.OPENSEARCH_DOMAIN_ARN || '';
const region = process.env.AWS_REGION || 'us-east-1';

// Extract domain endpoint from ARN
const getDomainEndpoint = async () => {
  if (!OPENSEARCH_DOMAIN_ARN) return null;
  
  const domainName = OPENSEARCH_DOMAIN_ARN.split('/').pop();
  if (!domainName) return null;
  
  const opensearch = new AWS.OpenSearch();
  try {
    const domain = await opensearch.describeDomain({ DomainName: domainName }).promise();
    return domain.DomainStatus.Endpoint;
  } catch (error) {
    console.error('Error getting OpenSearch domain endpoint:', error);
    return null;
  }
};

// Send data to OpenSearch
const sendToOpenSearch = async (endpoint, data) => {
  if (!endpoint) {
    console.log('No OpenSearch endpoint available');
    return false;
  }
  
  const url = new URL(`https://${endpoint}`);
  
  // Determine the index based on data type
  let index = 'softphonestreamstats-';
  let pipeline = 'stats_dailyindex';
  
  // Format the data for OpenSearch
  const timestamp = new Date().toISOString();
  const document = {
    doc: {
      contactId: data.contactId || 'unknown',
      agent: 'agent-' + (data.contactId || 'unknown'),
      timestamp: data.timestamp || timestamp,
      packetsLost: parseFloat(data.packetLoss) || 0,
      packetsCount: 100, // Assuming a base of 100 packets for percentage calculation
      jitterBufferMillis: data.networkLatency || 0,
      roundTripTimeMillis: data.networkLatency || 0,
      audioLevel: data.audioInput || 0,
      softphoneStreamType: 'audio_input',
      isDemoMode: data.isDemoMode || false
    }
  };
  
  // Sign the request
  const request = new AWS.HttpRequest(url, region);
  request.method = 'POST';
  request.path = `/${index}/_doc?pipeline=${pipeline}`;
  request.body = JSON.stringify(document);
  request.headers['Host'] = url.host;
  request.headers['Content-Type'] = 'application/json';
  
  const signer = new AWS.Signers.V4(request, 'es');
  signer.addAuthorization(AWS.config.credentials, new Date());
  
  // Send the request
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: url.hostname,
      path: request.path,
      method: request.method,
      headers: request.headers,
      body: request.body
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        console.log('OpenSearch response:', responseBody);
        resolve(true);
      });
    });
    
    req.on('error', (error) => {
      console.error('Error sending to OpenSearch:', error);
      reject(error);
    });
    
    req.write(request.body);
    req.end();
  });
};

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  // Default response
  const response = {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Required for CORS support
      'Access-Control-Allow-Credentials': true, // Required for cookies, authorization headers
    },
    body: JSON.stringify({ message: 'Metrics API handler' }),
  };
  
  try {
    // Process based on HTTP method
    if (event.httpMethod === 'GET') {
      response.body = JSON.stringify({ message: 'GET request received' });
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      
      // Get the OpenSearch domain endpoint
      const endpoint = await getDomainEndpoint();
      
      // Send the data to OpenSearch
      if (endpoint) {
        await sendToOpenSearch(endpoint, body);
        response.body = JSON.stringify({ 
          message: 'Data sent to OpenSearch successfully', 
          data: body 
        });
      } else {
        response.body = JSON.stringify({ 
          message: 'OpenSearch endpoint not available', 
          data: body 
        });
      }
    }
  } catch (error) {
    console.error('Error processing request:', error);
    response.statusCode = 500;
    response.body = JSON.stringify({ message: 'Internal server error' });
  }
  
  return response;
};
