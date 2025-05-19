// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from '@aws-cdk/core';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as s3 from '@aws-cdk/aws-s3';
import * as apigateway from '@aws-cdk/aws-apigateway';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as uuid from 'uuid';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as customResources from '@aws-cdk/custom-resources';

export interface StreamsGeneratorStackProps {
  ccpUrl: string,
  api: apigateway.RestApi,
  streamsBucket: s3.Bucket,
  streamsDistribution: cloudfront.IDistribution
  streamsAsset: s3deployment.ISource
}

export class StreamsGeneratorStack extends cfn.NestedStack {
  public customResource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: StreamsGeneratorStackProps) {
    super(scope, id);

    /* Create a map which contains the URLs of the S3 Website and API Gateway */
    const propertyMap = {};
    Object.defineProperties(propertyMap,
      {
        CcpUrl: { enumerable: true, value: props.ccpUrl },
        ApiGatewayUrl: { enumerable: true, value: props.api.url },
        S3WebsiteUrl: { enumerable: true, value: props.streamsBucket.bucketWebsiteUrl },
        S3Bucket: { enumerable: true, value: props.streamsBucket.bucketName },
        Random: { enumerable: true, value: JSON.stringify(uuid.v4()) },
        SamlUrl: { enumerable: true, value: process.env.SAML_URL },
      });
    const streamsDeployment = new s3deployment.BucketDeployment(this, 'StreamsDeployment', {
      sources: [props.streamsAsset],
      destinationBucket: props.streamsBucket,
      retainOnDelete: false,
      distribution: props.streamsDistribution,
      distributionPaths: ['/*'],
    });
    /* Generate streams website dynamically using Lambda and the API Gateway URL generated above  */
    const streamsGenerator = new lambda.Function(this, 'streamsGenerator', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset('./resources/custom-resources/frontend-generator'),
      handler: 'frontendGenerator.handler',
      timeout: cdk.Duration.minutes(2),
      memorySize: 3000,
    });

    const s3ObjectAccess = new iam.PolicyStatement();
    s3ObjectAccess.addActions('s3:*Object');
    s3ObjectAccess.addResources(`${props.streamsBucket.bucketArn}/*`);

    const s3ListAccess = new iam.PolicyStatement();
    s3ListAccess.addActions('s3:ListBucket');
    s3ListAccess.addResources(`${props.streamsBucket.bucketArn}`);

    streamsGenerator.addToRolePolicy(s3ObjectAccess);
    streamsGenerator.addToRolePolicy(s3ListAccess);
    streamsGenerator.node.addDependency(streamsDeployment);

    /* Create a custom resource which uses the property map to fill our bucket with
         * a streams API endpoint that can access our API Gateway deployment and S3 bucket
         * TODO: Investigate why the provider does not percolate up failures from the
         * custom resource */

    const provider = new customResources.Provider(this, 'StreamsWebsiteProvider', {
      onEventHandler: streamsGenerator,
    });
    const streamsGeneratorResource = new cdk.CustomResource(this, 'StreamsWebsiteGenerator', {
      serviceToken: provider.serviceToken,
      properties: propertyMap,
    });
    streamsGeneratorResource.node.addDependency(streamsDeployment);
    this.customResource = streamsGeneratorResource;
  }
}
