// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const cfnResponse = require('./cfn-response');

exports.handler = async function (event, context) {
  console.log(`${JSON.stringify(event, 0, 4)}`);
  if (event.RequestType.toLowerCase() === 'create' || event.RequestType.toLowerCase() === 'update') {
    try {
      if (process.env.CFN_RESPONSE_PAYLOAD !== '') {
        const responsePayload = JSON.parse(process.env.CFN_RESPONSE_PAYLOAD);
        await cfnResponse.send(
          responsePayload.event,
          context,
          cfnResponse.SUCCESS,
          {
            KibanaUrl: process.env.KIBANA_URL,
            CognitoUrl: process.env.COGNITO_URL,
            CloudfrontUrl: process.env.CLOUDFRONT_URL,
          },
        );
      }
      await cfnResponse.send(event, context, cfnResponse.SUCCESS, {});
    } catch (err) {
      await cfnResponse.send(event, context, cfnResponse.FAILED, { Error: err });
    }
  } else {
    await cfnResponse.send(event, context, cfnResponse.SUCCESS, {});
  }
};
