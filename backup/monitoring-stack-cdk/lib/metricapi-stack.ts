// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cfn from '@aws-cdk/aws-cloudformation';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as elasticsearch from '@aws-cdk/aws-elasticsearch';
import * as apigateway from '@aws-cdk/aws-apigateway';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as firehose from '@aws-cdk/aws-kinesisfirehose';
import * as s3 from '@aws-cdk/aws-s3'
import * as logs from '@aws-cdk/aws-logs'

export interface MetricApiProps {
  elasticsearchArn?: string,
  streamsDistribution: cloudfront.CloudFrontWebDistribution,
  customStreamsUrl: string | undefined
}

const lambdaResourcesPath = './resources/lambda-functions';

export class MetricApiStack extends cfn.NestedStack {
  public api: apigateway.RestApi;
  public streamStatsFirehose: firehose.CfnDeliveryStream;
  public apiMetricsFirehose: firehose.CfnDeliveryStream;
  public callReportFirehose: firehose.CfnDeliveryStream;

  constructor(scope: cdk.Construct, id: string, props: MetricApiProps) {
    super(scope, id);
    const suffix = cdk.Fn.select(3, cdk.Fn.split('-', cdk.Fn.select(2, cdk.Fn.split('/', this.stackId))));
    const corsUrl = props.customStreamsUrl == undefined
      ? `https://${props.streamsDistribution.distributionDomainName}`
      : props.customStreamsUrl

    this.api = new apigateway.RestApi(this, 'ElasticsearchApi', {
      restApiName: 'Connect Monitoring API',
      defaultCorsPreflightOptions: {
        allowOrigins: [ corsUrl ],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent']
      },
    });

    const firehoseBackupBucket = new s3.Bucket(this, 'Firehose Backup Bucket', {});

    const firehoseDeliveryPolicy = new iam.ManagedPolicy(this, 'Agent Monitoring Firehose Delivery Policy', {
      statements: [
        iam.PolicyStatement.fromJson({      
          "Effect": "Allow",      
          "Action": [
              "s3:AbortMultipartUpload",
              "s3:GetBucketLocation",
              "s3:GetObject",
              "s3:ListBucket",
              "s3:ListBucketMultipartUploads",
              "s3:PutObject"
          ],      
          "Resource": [        
              firehoseBackupBucket.bucketArn,
              `${firehoseBackupBucket.bucketArn}/*`		    
          ]    
        }),
        iam.PolicyStatement.fromJson({
          "Effect": "Allow",
          "Action": [
              "logs:PutLogEvents"
          ],
          "Resource": [
              "*"
          ]
        }),
    ]});

    const firehoseLogGroup = new logs.LogGroup(this, 'Firehose Log Group', {});
    const firehoseLogStream = new logs.LogStream(this, 'Firehose Log Stream', {
      logGroup: firehoseLogGroup,
    })
    if(process.env.SPLUNK_ENDPOINT == null || process.env.SPLUNK_ENDPOINT == undefined || process.env.SPLUNK_ENDPOINT == '') {
      firehoseDeliveryPolicy.addStatements(
        iam.PolicyStatement.fromJson({
          "Effect": "Allow",
          "Action": [
              "es:DescribeElasticsearchDomain",
              "es:DescribeElasticsearchDomains",
              "es:DescribeElasticsearchDomainConfig",
              "es:ESHttpPost",
              "es:ESHttpPut"
          ],
          "Resource": [
              props.elasticsearchArn,
              `${props.elasticsearchArn}/*`
          ]
        }),
        iam.PolicyStatement.fromJson({
          "Effect": "Allow",
          "Action": [
              "es:ESHttpGet"
          ],
          "Resource": [
            `${props.elasticsearchArn}/*`
          ]
        }),
      );
      const firehoseDeliveryRole = new iam.Role(this, 'Agent Monitoring Firehose Delivery Role', {
        roleName: `agentMonitoringFirehoseDeliveryRole-${suffix}`,
        managedPolicies: [ firehoseDeliveryPolicy ],
        assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com')
      });
      this.createElasticsearchFirehoseStreams(
        props.elasticsearchArn!,
        suffix,
        firehoseDeliveryRole,
        firehoseLogGroup,
        firehoseLogStream,
        firehoseBackupBucket
      );
    } else {
      const firehoseDeliveryRole = new iam.Role(this, 'Agent Monitoring Firehose Delivery Role', {
        roleName: `agentMonitoringFirehoseDeliveryRole-${suffix}`,
        managedPolicies: [ firehoseDeliveryPolicy ],
        assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com')
      });

      this.createSplunkFirehoseStreams(
        suffix,
        firehoseDeliveryRole,
        firehoseLogGroup,
        firehoseLogStream,
        firehoseBackupBucket
      )
    }
    this.createApiMetricsEndpoint(corsUrl);
    this.createSoftphoneCallReportEndpoint(corsUrl);
    this.createSoftphoneStreamStatsEndpoint(corsUrl);
  }

  private createSplunkFirehoseStreams(suffix: string, firehoseDeliveryRole: iam.Role, firehoseLogGroup: logs.LogGroup, firehoseLogStream: logs.LogStream, firehoseBackupBucket: s3.Bucket) {
    this.streamStatsFirehose = new firehose.CfnDeliveryStream(this, 'Softphone Stream Stats Monitoring Delivery Stream', {
      deliveryStreamName: `streamStatsMonitoringStream-${suffix}`,
      splunkDestinationConfiguration: {
        hecEndpoint: process.env.SPLUNK_ENDPOINT!,
        hecToken: process.env.SPLUNK_TOKEN!,
        hecEndpointType: "Raw",
        s3Configuration: {
          bucketArn: firehoseBackupBucket.bucketArn,
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: firehoseLogGroup.logGroupName,
            logStreamName: firehoseLogStream.logStreamName,
          },
          roleArn: firehoseDeliveryRole.roleArn
        },
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: firehoseLogGroup.logGroupName,
          logStreamName: firehoseLogStream.logStreamName
        },
      }
    });

    this.apiMetricsFirehose = new firehose.CfnDeliveryStream(this, 'Api Metrics Monitoring Delivery Stream', {
      deliveryStreamName: `apiMetricsMonitoringStream-${suffix}`,
      splunkDestinationConfiguration: {
        hecEndpoint: process.env.SPLUNK_ENDPOINT!,
        hecToken: process.env.SPLUNK_TOKEN!,
        hecEndpointType: "Raw",
        s3Configuration: {
          bucketArn: firehoseBackupBucket.bucketArn,
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: firehoseLogGroup.logGroupName,
            logStreamName: firehoseLogStream.logStreamName,
          },
          roleArn: firehoseDeliveryRole.roleArn
        },
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: firehoseLogGroup.logGroupName,
          logStreamName: firehoseLogStream.logStreamName
        },
      }
    });

    this.callReportFirehose = new firehose.CfnDeliveryStream(this, 'Call Reports Monitoring Delivery Stream', {
      deliveryStreamName: `callReportsMonitoringStream-${suffix}`,
      splunkDestinationConfiguration: {
        hecEndpoint: process.env.SPLUNK_ENDPOINT!,
        hecToken: process.env.SPLUNK_TOKEN!,
        hecEndpointType: "Raw",
        s3Configuration: {
          bucketArn: firehoseBackupBucket.bucketArn,
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: firehoseLogGroup.logGroupName,
            logStreamName: firehoseLogStream.logStreamName,
          },
          roleArn: firehoseDeliveryRole.roleArn
        },
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: firehoseLogGroup.logGroupName,
          logStreamName: firehoseLogStream.logStreamName
        },
      }
    });
  }

  private createElasticsearchFirehoseStreams(domainArn: string, suffix: string, firehoseDeliveryRole: iam.Role, firehoseLogGroup: logs.LogGroup, firehoseLogStream: logs.LogStream, firehoseBackupBucket: s3.Bucket) {

    this.streamStatsFirehose = new firehose.CfnDeliveryStream(this, 'Softphone Stream Stats Monitoring Delivery Stream', {
      deliveryStreamName: `streamStatsMonitoringStream-${suffix}`,
      elasticsearchDestinationConfiguration: {
        domainArn: domainArn,
        indexName: 'softphonestreamstats',
        roleArn: firehoseDeliveryRole.roleArn,
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: firehoseLogGroup.logGroupName,
          logStreamName: firehoseLogStream.logStreamName
        },
        indexRotationPeriod: 'OneDay',
        s3BackupMode: 'AllDocuments',
        s3Configuration: {
          bucketArn: firehoseBackupBucket.bucketArn,
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: firehoseLogGroup.logGroupName,
            logStreamName: firehoseLogStream.logStreamName,
          },
          roleArn: firehoseDeliveryRole.roleArn
        },
        bufferingHints: {
          sizeInMBs: 5,
          intervalInSeconds: 60
        }
      }
    });

    this.apiMetricsFirehose = new firehose.CfnDeliveryStream(this, 'Api Metrics Monitoring Delivery Stream', {
      deliveryStreamName: `apiMetricsMonitoringStream-${suffix}`,
      elasticsearchDestinationConfiguration: {
        domainArn: domainArn,
        indexName: 'apimetric',
        roleArn: firehoseDeliveryRole.roleArn,
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: firehoseLogGroup.logGroupName,
          logStreamName: firehoseLogStream.logStreamName
        },
        indexRotationPeriod: 'OneDay',
        s3BackupMode: 'AllDocuments',
        s3Configuration: {
          bucketArn: firehoseBackupBucket.bucketArn,
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: firehoseLogGroup.logGroupName,
            logStreamName: firehoseLogStream.logStreamName,
          },
          roleArn: firehoseDeliveryRole.roleArn
        },
        bufferingHints: {
          sizeInMBs: 5,
          intervalInSeconds: 60
        }
      }
    });

    this.callReportFirehose = new firehose.CfnDeliveryStream(this, 'Call Reports Monitoring Delivery Stream', {
      deliveryStreamName: `callReportsMonitoringStream-${suffix}`,
      elasticsearchDestinationConfiguration: {
        domainArn: domainArn,
        indexName: 'softphonecallreport',
        roleArn: firehoseDeliveryRole.roleArn,
        cloudWatchLoggingOptions: {
          enabled: true,
          logGroupName: firehoseLogGroup.logGroupName,
          logStreamName: firehoseLogStream.logStreamName
        },
        indexRotationPeriod: 'OneDay',
        s3BackupMode: 'AllDocuments',
        s3Configuration: {
          bucketArn: firehoseBackupBucket.bucketArn,
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: firehoseLogGroup.logGroupName,
            logStreamName: firehoseLogStream.logStreamName,
          },
          roleArn: firehoseDeliveryRole.roleArn
        },
        bufferingHints: {
          sizeInMBs: 5,
          intervalInSeconds: 60
        }
      }
    });
  }

  private createSoftphoneStreamStatsEndpoint(corsUrl: string) {
    const apiResource = this.api.root.addResource('softphonemetrics');
    const apiIntegration = new apigateway.AwsIntegration({
      service: "firehose",
      action: "PutRecordBatch",
      integrationHttpMethod: "POST",
      options: {
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: {
          'application/json': `#set( $StatsArray = $input.path('$.softphoneStreamStatistics') )##
          ##
          #set( $callConfig = $util.parseJson($input.path('$.callConfigJson')) )##
          #set( $agentPrivateIp = $input.path('$.agentPrivateIp') )##
          #set( $agentRoutingProfile = $input.path('$.agentRoutingProfile') )##
          #set( $contactId = $input.path('$.contactId') )##
          #set( $contactQueue = $input.path('$.contactQueue') )##
          #set( $agent = $input.path('$.agent') )##
          #set( $signalingEndpoint = $callConfig.signalingEndpoint )##
          #set( $iceServers = $callConfig.iceServers[0].urls[0].replace('?transport=udp','') )##
          #set( $agentPublicIp = $context.identity.sourceIp )##
          ##
          {##
              "DeliveryStreamName":"${this.streamStatsFirehose.deliveryStreamName}",##
              "Records":[##
                  #foreach( $item in $StatsArray )##
                      #define( $payload ) {##
                          "doc": {##
                              "agentPrivateIp":"$agentPrivateIp",##
                              "agentRoutingProfile":"$agentRoutingProfile",##
                              "contactId":"$contactId",##
                              "contactQueue":"$contactQueue",##
                              "agent":"$agent",##
                              "signalingEndpoint":"$signalingEndpoint",##
                              "iceServers":"$iceServers",##
                              "agentPublicIp":"$agentPublicIp",##
                              "softphoneStreamType":"$item.softphoneStreamType",##
                              "timestamp":"$item.timestamp",##
                              "packetsLost": #if($item.packetsLost>=0)##
                                    $item.packetsLost,##
                                  #{else}##
                                    0,##
                                  #end##
                              "packetsCount": #if($item.packetsCount>=0)##
                                    $item.packetsCount,##
                                  #{else}##
                                    0,##
                                  #end##
                              "audioLevel": #if($item.audioLevel>=0)##
                                      $item.audioLevel,##
                                  #{else}##
                                      0,##
                                  #end##
                              "jitterBufferMillis": #if ($item.jitterBufferMillis>=0)##
                                      $item.jitterBufferMillis,##
                                  #{else}##
                                      0,##
                                  #end##
                              "roundTripTimeMillis": #if($item.roundTripTimeMillis>=0)##
                                      $item.roundTripTimeMillis ##
                                  #{else}##
                                      0##
                                  #end##
                          }##
                      }##
                      #end##
                      {##
                          "Data":"$util.base64Encode($payload)"##
                      }   #if($foreach.hasNext),#end##
                  #end##
              ]##
          }##`
        },
        requestParameters: {
          "integration.request.header.Accept": "'*/*'",
          "integration.request.header.X-Amz-Target": "'Firehose_20150804.PutRecordBatch'",
          "integration.request.header.Content-Type": "'application/x-amz-json-1.1'"
        },
        integrationResponses: [
          {
            selectionPattern: "4\\d{2}",
            statusCode: "400",
          },
          {
            selectionPattern: "5\\{d2}",
            statusCode: "500",
          },
          {
            selectionPattern: "2\\d{2}",
            statusCode: "200",
            responseParameters: {
              "method.response.header.Content-Type": "'application/json'",
              "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
              "method.response.header.Access-Control-Allow-Origin": `'${corsUrl}'`
            },
            responseTemplates: {
              "application/json": "##  See http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html\n##  This template will pass through all parameters including path, querystring, header, stage variables, and context through to the integration endpoint via the body/payload\n#set($allParams = $input.params())\n{\n\"body-json\" : $input.json('$'),\n\"params\" : {\n#foreach($type in $allParams.keySet())\n    #set($params = $allParams.get($type))\n\"$type\" : {\n    #foreach($paramName in $params.keySet())\n    \"$paramName\" : \"$util.escapeJavaScript($params.get($paramName))\"\n        #if($foreach.hasNext),#end\n    #end\n}\n    #if($foreach.hasNext),#end\n#end\n},\n\"stage-variables\" : {\n#foreach($key in $stageVariables.keySet())\n\"$key\" : \"$util.escapeJavaScript($stageVariables.get($key))\"\n    #if($foreach.hasNext),#end\n#end\n},\n\"context\" : {\n    \"account-id\" : \"$context.identity.accountId\",\n    \"api-id\" : \"$context.apiId\",\n    \"api-key\" : \"$context.identity.apiKey\",\n    \"authorizer-principal-id\" : \"$context.authorizer.principalId\",\n    \"caller\" : \"$context.identity.caller\",\n    \"cognito-authentication-provider\" : \"$context.identity.cognitoAuthenticationProvider\",\n    \"cognito-authentication-type\" : \"$context.identity.cognitoAuthenticationType\",\n    \"cognito-identity-id\" : \"$context.identity.cognitoIdentityId\",\n    \"cognito-identity-pool-id\" : \"$context.identity.cognitoIdentityPoolId\",\n    \"http-method\" : \"$context.httpMethod\",\n    \"stage\" : \"$context.stage\",\n    \"source-ip\" : \"$context.identity.sourceIp\",\n    \"user\" : \"$context.identity.user\",\n    \"user-agent\" : \"$context.identity.userAgent\",\n    \"user-arn\" : \"$context.identity.userArn\",\n    \"request-id\" : \"$context.requestId\",\n    \"resource-id\" : \"$context.resourceId\",\n    \"resource-path\" : \"$context.resourcePath\"\n    }\n}\n"
            }   
          }
        ],
        credentialsRole: new iam.Role(this, 'streamStatsPushToFirehose', {
          assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
          managedPolicies: [ new iam.ManagedPolicy(this, 'Stream Stats Push to Firehose', {
            statements: [
              new iam.PolicyStatement({
                actions: ['firehose:PutRecordBatch'],
                resources: [this.streamStatsFirehose.attrArn]
              })
            ]
          })]
        })
      },
    });
    apiResource.addMethod('POST', apiIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Content-Type': true
          }
        },
        {
          statusCode: '400'
        },
        {
          statusCode: '500'
        }
      ]
    });
  }

  private createSoftphoneCallReportEndpoint(corsUrl: string) {
    const apiResource = this.api.root.addResource('callreport');
    const apiIntegration = new apigateway.AwsIntegration({
      service: "firehose",
      action: "PutRecord",
      integrationHttpMethod: "POST",
      options: {
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: {
          'application/json': `#set( $body = $input.path('$') )##
          #set($callConfig = $util.parseJson($input.path("$.callConfigJson")))##
          #set($signalingEndpoint = $callConfig.signalingEndpoint)##
          #set($iceServers = $callConfig.iceServers[0].urls[0].replace('?transport=udp',''))##
          #set($timestamp = $input.json("$.report.callEndTime"))##
          #define($payload)##
          {##
          #foreach ($level2 in $body.entrySet())##
              #if($level2.key != "callConfigJson" )##
                  #if ($level2.value.size() > 0)##
                      "$level2.key": {##
                          #foreach($level3 in $level2.value.entrySet())##
                              #if($level3.value.size() > 0)"$level3.key":$level3.value#if($foreach.hasNext),#end##
                              #else##
                                 #if($level3.key == "callStartTime" || $level3.key == "callEndTime") ##
                                      "$level3.key": "$level3.value"#if($foreach.hasNext),#end##
                                  #else##
                                      "$level3.key":##
                                          #if($level3.value != "")##
                                          $level3.value#if($foreach.hasNext),#end##
                                          #else##
                                          ""#if($foreach.hasNext),#end##
                                          #end##
                                  #end##
                              #end##
                          #end##
                      },##
                  #else##
                      "$level2.key": "$level2.value",##
                  #end##
              #end##
          #end##
          "agentPublicIp":"$context.identity.sourceIp",##
          "signalingEndpoint":"$signalingEndpoint",##
          "iceServers":"$iceServers",##
          "timestamp":$timestamp##
          }##
          #end##
          {##
          "DeliveryStreamName": "${this.callReportFirehose.deliveryStreamName}",##
          "Record":{"Data": "$util.base64Encode($payload)"}##
          }##`
        },
        requestParameters: {
          "integration.request.header.Accept": "'*/*'",
          "integration.request.header.X-Amz-Target": "'Firehose_20150804.PutRecord'",
          "integration.request.header.Content-Type": "'application/x-amz-json-1.1'"
        },
        integrationResponses: [
          {
            selectionPattern: "4\\d{2}",
            statusCode: "400",
          },
          {
            selectionPattern: "5\\d{2}",
            statusCode: "500",
          },
          {
            selectionPattern: "2\\d{2}",
            statusCode: "200",
            responseParameters: {
              "method.response.header.Content-Type": "'application/json'",
              "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
              "method.response.header.Access-Control-Allow-Origin": `'${corsUrl}'`
            },
            responseTemplates: {
              "application/json": "##  See http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html\n##  This template will pass through all parameters including path, querystring, header, stage variables, and context through to the integration endpoint via the body/payload\n#set($allParams = $input.params())\n{\n\"body-json\" : $input.json('$'),\n\"params\" : {\n#foreach($type in $allParams.keySet())\n    #set($params = $allParams.get($type))\n\"$type\" : {\n    #foreach($paramName in $params.keySet())\n    \"$paramName\" : \"$util.escapeJavaScript($params.get($paramName))\"\n        #if($foreach.hasNext),#end\n    #end\n}\n    #if($foreach.hasNext),#end\n#end\n},\n\"stage-variables\" : {\n#foreach($key in $stageVariables.keySet())\n\"$key\" : \"$util.escapeJavaScript($stageVariables.get($key))\"\n    #if($foreach.hasNext),#end\n#end\n},\n\"context\" : {\n    \"account-id\" : \"$context.identity.accountId\",\n    \"api-id\" : \"$context.apiId\",\n    \"api-key\" : \"$context.identity.apiKey\",\n    \"authorizer-principal-id\" : \"$context.authorizer.principalId\",\n    \"caller\" : \"$context.identity.caller\",\n    \"cognito-authentication-provider\" : \"$context.identity.cognitoAuthenticationProvider\",\n    \"cognito-authentication-type\" : \"$context.identity.cognitoAuthenticationType\",\n    \"cognito-identity-id\" : \"$context.identity.cognitoIdentityId\",\n    \"cognito-identity-pool-id\" : \"$context.identity.cognitoIdentityPoolId\",\n    \"http-method\" : \"$context.httpMethod\",\n    \"stage\" : \"$context.stage\",\n    \"source-ip\" : \"$context.identity.sourceIp\",\n    \"user\" : \"$context.identity.user\",\n    \"user-agent\" : \"$context.identity.userAgent\",\n    \"user-arn\" : \"$context.identity.userArn\",\n    \"request-id\" : \"$context.requestId\",\n    \"resource-id\" : \"$context.resourceId\",\n    \"resource-path\" : \"$context.resourcePath\"\n    }\n}\n"
            }   
          }
        ],
        
        credentialsRole: new iam.Role(this, 'callReportPushToFirehose', {
          assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
          managedPolicies: [ new iam.ManagedPolicy(this, 'Call Reports Push to Firehose', {
            statements: [
              new iam.PolicyStatement({
                actions: ['firehose:PutRecord'],
                resources: [this.callReportFirehose.attrArn]
              })
            ]
          })]
        }),
      },
    })
    apiResource.addMethod('POST', apiIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Content-Type': true
          }
        },
        {
          statusCode: '400'
        },
        {
          statusCode: '500'
        }
      ]
    });
  }

  private createApiMetricsEndpoint(corsUrl: string) {
    const apiResource = this.api.root.addResource('apimetrics');
    const apiIntegration = new apigateway.AwsIntegration({
      service: "firehose",
      action: "PutRecordBatch",
      integrationHttpMethod: "POST",
      options: {
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: {
          "application/json": "#set( $agent = $input.path('$.agent') )\r\n{\"DeliveryStreamName\":\"" + this.apiMetricsFirehose.deliveryStreamName + "\",\"Records\":[#foreach($metric in $input.path('$.API_METRIC'))#set( $apiName = $metric.name )#set( $latency = $metric.time )#set( $timestamp = $metric.timestamp )#define( $payload ){\"doc\":{\"agent\":\"$agent\",\"timestamp\":\"$timestamp\",\"$apiName\":$latency}}#end{\"Data\":\"$util.base64Encode($payload)\"}#if($foreach.hasNext),#end#end]}"
        },
        requestParameters: {
          "integration.request.header.Accept": "'*/*'",
          "integration.request.header.X-Amz-Target": "'Firehose_20150804.PutRecordBatch'",
          "integration.request.header.Content-Type": "'application/x-amz-json-1.1'"
        },
        integrationResponses: [
          {
            selectionPattern: "4\\d{2}",
            statusCode: "400",
          },
          {
            selectionPattern: "5\\{d2}",
            statusCode: "500",
          },
          {
            selectionPattern: "2\\d{2}",
            statusCode: "200",
            responseParameters: {
              "method.response.header.Content-Type": "'application/json'",
              "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
              "method.response.header.Access-Control-Allow-Origin": `'${corsUrl}'`
            },
            responseTemplates: {
              "application/json": "$input.json('$.FailedPutCount')"
            },
          },
        ],
        
        credentialsRole: new iam.Role(this, 'apiMetricsPushToFirehose', {
          assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
          managedPolicies: [ new iam.ManagedPolicy(this, 'API Metrics Push to Firehose', {
            statements: [
              new iam.PolicyStatement({
                actions: ['firehose:PutRecordBatch'],
                resources: [this.apiMetricsFirehose.attrArn]
              })
            ]
          })]
        })
      },
    });
    apiResource.addMethod('POST', apiIntegration, {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Content-Type': true
          }
        },
        {
          statusCode: '400'
        },
        {
          statusCode: '500'
        }
      ]
    });
  }

}
