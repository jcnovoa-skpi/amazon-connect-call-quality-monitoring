// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from '@aws-cdk/core';
import { StreamsGeneratorStack } from './streamsgenerator-stack';
import { MetricApiStack } from './metricapi-stack';
import cloudfront = require('@aws-cdk/aws-cloudfront');
import customResource = require('@aws-cdk/custom-resources');
import lambda = require('@aws-cdk/aws-lambda');
import s3 = require('@aws-cdk/aws-s3');
import s3deployment = require('@aws-cdk/aws-s3-deployment');
import elasticSearchStack = require('./elasticsearch-stack');

export default class MonitoringStack extends cdk.Stack {
  constructor(app: cdk.App, id: string) {
    super(app, id);

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
      
    const streamsBucket = new s3.Bucket(this, 'StreamsBucket', {
      websiteIndexDocument: 'index.html',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });
    const streamsAsset = s3deployment.Source.asset('./resources/frontend');
    const streamsDistributionOai = new cloudfront.OriginAccessIdentity(this, 'StreamsBucketOAI', {});

    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'StreamsDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: streamsBucket,
            originAccessIdentity: streamsDistributionOai,
          },
          behaviors: [{ isDefaultBehavior: true }],
        },
      ],
    });

    const elasticsearchStackDeployment = 
      process.env.SPLUNK_ENDPOINT == undefined ||
      process.env.SPLUNK_ENDPOINT == '' 
      ? new elasticSearchStack.ElasticSearchStack(this, 'ElasticsearchStack', {
        ccpUrl,
      })
      : undefined;

    const metricsApiStackDeployment = new MetricApiStack(this, 'MetricsApiStack', {
      elasticsearchArn: elasticsearchStackDeployment == undefined ? undefined : elasticsearchStackDeployment!.elasticsearchArn,
      streamsDistribution: distribution,
      customStreamsUrl: customStreamsUrl
    });

    const streamsApiDeployment = new StreamsGeneratorStack(this, 'DynamicFrontendStack', {
      api: metricsApiStackDeployment.api,
      ccpUrl,
      streamsAsset,
      streamsBucket,
      streamsDistribution: distribution,
    });

    new cdk.CfnOutput(this, 'COGNITO_URL', {
      value: elasticsearchStackDeployment == undefined ? "" : elasticsearchStackDeployment!.getUserCreateUrl().toString(),
    }); 
    
    new cdk.CfnOutput(this, 'KIBANA_URL', {
      value: elasticsearchStackDeployment == undefined ? "" : elasticsearchStackDeployment == undefined ? "" : elasticsearchStackDeployment!.getKibanaUrl().toString(),
    }); 

    new cdk.CfnOutput(this, 'CLOUDFRONT_URL', {
      value: "https://" + distribution.distributionDomainName.toString(),
    }); 
  }
}
