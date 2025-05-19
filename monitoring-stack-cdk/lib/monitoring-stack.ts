// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack, App, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StreamsGeneratorStack } from './streamsgenerator-stack';
import { MetricApiStack } from './metricapi-stack';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as customResource from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deployment from 'aws-cdk-lib/aws-s3-deployment';
import elasticSearchStack = require('./elasticsearch-stack');

export default class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const customStreamsUrl = process.env.STREAMS_URL;
    if (customStreamsUrl != undefined &&
      ( !customStreamsUrl?.startsWith('https://') || customStreamsUrl.endsWith('/') )){
      throw(new Error("Custom Streams URL must begin with https:// and not contain trailing slash"));
    }
    const ccpUrl = process.env.CCP_URL;
    if (
      ccpUrl == undefined 
      || !ccpUrl.startsWith('https://') 
      || !(ccpUrl.includes('.awsapps.com') || ccpUrl.includes('.my.connect.aws'))
      || !ccpUrl.includes('/ccp-v2') ) {
        throw(new Error('CCP URL must be the https:// url to your ccp-v2 softphone'));
      }

    // Make OpenSearch deployment optional
    const deployOpenSearch = process.env.DEPLOY_OPENSEARCH !== 'false';
    
    const elasticsearchStackDeployment = 
      (process.env.ES_DOMAIN_ENDPOINT == undefined && deployOpenSearch) ? 
        new elasticSearchStack.ElasticSearchStack(this, 'ElasticSearchStack', {
          ccpUrl,
        }) : undefined;

    // Create S3 bucket with website hosting enabled but without public access
    const streamsBucket = new s3.Bucket(this, 'StreamsBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      // Remove publicReadAccess: true
    });

    const streamsDistribution = new cloudfront.CloudFrontWebDistribution(this, 'StreamsDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: streamsBucket,
            // Add origin access identity to allow CloudFront to access the bucket
            originAccessIdentity: new cloudfront.OriginAccessIdentity(this, 'StreamsBucketOAI')
          },
          behaviors: [{ isDefaultBehavior: true }],
        },
      ],
    });

    const metricApiStack = new MetricApiStack(this, 'MetricApiStack', {
      elasticsearchArn: elasticsearchStackDeployment == undefined ? undefined : elasticsearchStackDeployment!.elasticsearchArn,
      streamsDistribution,
      customStreamsUrl,
    });

    const streamsGeneratorStack = new StreamsGeneratorStack(this, 'StreamsGeneratorStack', {
      ccpUrl,
      api: metricApiStack.api,
      streamsBucket,
      streamsDistribution,
      streamsAsset: s3deployment.Source.asset('./resources/streams'),
    });

    new CfnOutput(this, 'StreamsUrl', {
      value: `https://${streamsDistribution.distributionDomainName}`,
    });

    new CfnOutput(this, 'UserCreateUrl', {
      value: elasticsearchStackDeployment == undefined ? "OpenSearch not deployed" : elasticsearchStackDeployment!.getUserCreateUrl().toString(),
    });

    new CfnOutput(this, 'KibanaUrl', {
      value: elasticsearchStackDeployment == undefined ? "OpenSearch not deployed" : elasticsearchStackDeployment!.getKibanaUrl().toString(),
    });
  }
}
