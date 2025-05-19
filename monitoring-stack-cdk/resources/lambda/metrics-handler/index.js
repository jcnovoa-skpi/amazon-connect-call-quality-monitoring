// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

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
      response.body = JSON.stringify({ message: 'POST request received', data: body });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    response.statusCode = 500;
    response.body = JSON.stringify({ message: 'Internal server error' });
  }
  
  return response;
};
