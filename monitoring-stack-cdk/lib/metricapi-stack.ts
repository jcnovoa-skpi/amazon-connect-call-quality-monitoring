// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { NestedStack, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as logs from 'aws-cdk-lib/aws-logs'

export interface MetricApiProps {
  elasticsearchArn?: string,
  streamsDistribution: cloudfront.CloudFrontWebDistribution,
  customStreamsUrl: string | undefined
}

export class MetricApiStack extends NestedStack {
  public api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: MetricApiProps) {
    super(scope, id);

    // Create a REST API for our metrics
    this.api = new apigateway.RestApi(this, 'MetricsApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: props.customStreamsUrl ? [props.customStreamsUrl] : apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Create a Lambda function to handle API requests
    const metricsHandler = new lambda.Function(this, 'MetricsHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('./resources/lambda/metrics-handler'),
      handler: 'index.handler',
      timeout: Duration.seconds(30),
      environment: {
        OPENSEARCH_DOMAIN_ARN: props.elasticsearchArn || '',
      },
    });

    // Add permissions for the Lambda to access OpenSearch
    if (props.elasticsearchArn) {
      const esPolicy = new iam.PolicyStatement({
        actions: [
          "es:ESHttpGet",
          "es:ESHttpPost",
          "es:ESHttpPut",
          "es:ESHttpDelete",
          "es:ESHttpHead",
          "es:ESHttpPatch",
          "es:DescribeElasticsearchDomain",
          "es:DescribeElasticsearchDomains",
          "es:DescribeElasticsearchDomainConfig",
          "es:ListDomainNames",
          "es:ListTags",
          "es:GetUpgradeStatus",
        ],
        resources: [
          props.elasticsearchArn,
          `${props.elasticsearchArn}/*`
        ],
      });
      metricsHandler.addToRolePolicy(esPolicy);

      // Add permissions for OpenSearch Service
      const osPolicy = new iam.PolicyStatement({
        actions: [
          "aoss:APIAccessAll",
          "aoss:DescribeDomain",
          "aoss:DescribeDomains",
          "aoss:DescribeDomainConfig",
          "aoss:ListDomainNames",
          "aoss:ListTags",
          "aoss:GetUpgradeStatus",
        ],
        resources: [
          props.elasticsearchArn,
          `${props.elasticsearchArn}/*`
        ],
      });
      metricsHandler.addToRolePolicy(osPolicy);
    }

    // Create an API Gateway integration with the Lambda function
    const metricsIntegration = new apigateway.LambdaIntegration(metricsHandler);
    
    // Add routes to the API
    const metrics = this.api.root.addResource('metrics');
    metrics.addMethod('GET', metricsIntegration);
    metrics.addMethod('POST', metricsIntegration);
    
    // Create a Firehose delivery stream for metrics data
    const metricsLogGroup = new logs.LogGroup(this, 'MetricsLogGroup');
    
    const firehoseRole = new iam.Role(this, 'FirehoseRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
    });
    
    const metricsBucket = new s3.Bucket(this, 'MetricsBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    
    metricsBucket.grantReadWrite(firehoseRole);
    
    const metricsDeliveryStream = new firehose.CfnDeliveryStream(this, 'MetricsDeliveryStream', {
      extendedS3DestinationConfiguration: {
        bucketArn: metricsBucket.bucketArn,
        roleArn: firehoseRole.roleArn,
        bufferingHints: {
          intervalInSeconds: 60,
          sizeInMBs: 1
        },
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: metricsLogGroup.logGroupName,
          logStreamName: 'S3Delivery'
        },
        compressionFormat: 'UNCOMPRESSED',
        prefix: 'metrics/',
      }
    });
  }
}
