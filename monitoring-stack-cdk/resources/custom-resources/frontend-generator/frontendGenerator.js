// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  // Extract properties from the event
  const ccpUrl = event.ResourceProperties.CcpUrl;
  const apiGatewayUrl = event.ResourceProperties.ApiGatewayUrl;
  const s3Bucket = event.ResourceProperties.S3Bucket;
  const samlUrl = event.ResourceProperties.SamlUrl;
  
  console.log('CCP URL:', ccpUrl);
  console.log('API Gateway URL:', apiGatewayUrl);
  console.log('S3 Bucket:', s3Bucket);
  
  let responseData = {};
  let responseStatus = 'SUCCESS';
  
  try {
    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
      console.log('Creating or updating frontend resources');
      
      // Generate index.html with the proper configuration
      const indexHtml = generateIndexHtml(ccpUrl, apiGatewayUrl, samlUrl);
      
      // Upload to S3
      await s3.putObject({
        Bucket: s3Bucket,
        Key: 'index.html',
        Body: indexHtml,
        ContentType: 'text/html'
      }).promise();
      
      responseData = {
        Message: 'Frontend resources generated successfully',
        S3Bucket: s3Bucket
      };
    } else if (event.RequestType === 'Delete') {
      console.log('Deleting frontend resources');
      
      // No need to delete anything as the bucket will be deleted by CloudFormation
      responseData = {
        Message: 'Frontend resources cleanup completed successfully'
      };
    }
  } catch (error) {
    console.error('Error:', error);
    responseStatus = 'FAILED';
    responseData = {
      Error: error.message
    };
  }
  
  // Return response for CloudFormation
  return {
    Status: responseStatus,
    PhysicalResourceId: event.PhysicalResourceId || `frontend-generator-${Date.now()}`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData
  };
};

function generateIndexHtml(ccpUrl, apiGatewayUrl, samlUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Amazon Connect Monitoring Solution</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        header {
            background-color: #232f3e;
            color: white;
            padding: 20px 0;
            text-align: center;
        }
        h1 {
            margin: 0;
        }
        .content {
            background-color: white;
            padding: 20px;
            margin-top: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .config {
            display: none;
        }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <h1>Amazon Connect Monitoring Solution</h1>
        </div>
    </header>
    <div class="container">
        <div class="content">
            <h2>Welcome to the Amazon Connect Monitoring Solution</h2>
            <p>This solution helps you monitor call quality metrics for your Amazon Connect instance.</p>
            
            <h3>Configuration</h3>
            <ul>
                <li>CCP URL: ${ccpUrl}</li>
                <li>API Gateway: ${apiGatewayUrl}</li>
                ${samlUrl ? `<li>SAML URL: ${samlUrl}</li>` : ''}
            </ul>
            
            <div class="config" id="appConfig" data-ccp-url="${ccpUrl}" data-api-url="${apiGatewayUrl}" ${samlUrl ? `data-saml-url="${samlUrl}"` : ''}></div>
        </div>
    </div>
    
    <script>
        // Application initialization would go here in a real implementation
        console.log('Amazon Connect Monitoring Solution initialized');
        const config = {
            ccpUrl: '${ccpUrl}',
            apiGatewayUrl: '${apiGatewayUrl}',
            samlUrl: '${samlUrl || ''}'
        };
        console.log('Configuration:', config);
    </script>
</body>
</html>`;
}
