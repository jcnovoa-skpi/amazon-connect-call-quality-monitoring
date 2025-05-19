// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const fs = require('fs');
const aws = require('aws-sdk');
const s3 = new aws.S3();

/* could probably extract this into some sort of abstraction
 * it will only grow with each dependency */

const HTML_FILE_PATH = '/var/task/index.html';
const STREAMS_HTML_FILE = fs.readFileSync(HTML_FILE_PATH, 'utf-8');
const STREAMS_HTML_KEY = 'index.html';

function checkPreconditions(event) {
  return new Promise(((resolve, reject) => {
    if ((event.ResourceProperties.ApiGatewayUrl
          && event.ResourceProperties.S3WebsiteUrl
          && event.ResourceProperties.S3Bucket)) {
      resolve(true);
    } else {
      console.log(`Missing properties on event. ${JSON.stringify(event, 0, 4)}`);
      reject(new Error('Missing properties on event'));
    }
  }));
}
exports.handler = async (event, context) => {
  console.log(JSON.stringify(event, 0, 4));
  try {
    console.log(`Received event with type ${event.RequestType}`);
    await checkPreconditions(event);
    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
      const streamsHtmlLines = STREAMS_HTML_FILE.toString().split('\n');
      const lineToWrite = `<script src='connect-custom-implementation.js' apiGatewayUrl='${event.ResourceProperties.ApiGatewayUrl}' ccpUrl='${event.ResourceProperties.CcpUrl}' region='${process.env.AWS_REGION}' samlUrl='${event.ResourceProperties.SamlUrl}'></script>`;
      if (streamsHtmlLines[streamsHtmlLines.length - 1] !== lineToWrite) {
        streamsHtmlLines.length -= 1;
        streamsHtmlLines.push(lineToWrite);
        const s3Result = await s3.upload({
          Key: STREAMS_HTML_KEY,
          Bucket: event.ResourceProperties.S3Bucket,
          Body: streamsHtmlLines.join('\n'),
          ContentType: 'text/html',
        }).promise();
        console.log(`Finished uploading HTML with result ${JSON.stringify(s3Result, 0, 4)}`);
      }
      console.log('Successfully generated frontend');
    } else if (event.RequestType === 'Delete') {
      // If we need to delete, we can delete both objects with a single request
      // Objects must be deleted for S3 buckets to be deleted on stack delete
      const s3Result = await s3.deleteObjects({
        Delete: {
          Objects: [
            {
              Key: 'index.html',
            },
          ],
          Quiet: false,
        },
        Bucket: event.ResourceProperties.S3Bucket,
      }).promise();
      console.log(`Deletion result: ${s3Result}`);
    }
  } catch (error) {
    // If we're here we received a promise rejection and failed to process the event
    console.log(JSON.stringify(error, 0, 4));
    throw new Error('Failed to process, check Lambda logs');
  }
};
