"use strict";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricApiStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const firehose = require("aws-cdk-lib/aws-kinesisfirehose");
const s3 = require("aws-cdk-lib/aws-s3");
const logs = require("aws-cdk-lib/aws-logs");
class MetricApiStack extends aws_cdk_lib_1.NestedStack {
    constructor(scope, id, props) {
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
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
exports.MetricApiStack = MetricApiStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0cmljYXBpLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibWV0cmljYXBpLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxxRUFBcUU7QUFDckUsaUNBQWlDOzs7QUFFakMsNkNBQW1FO0FBRW5FLGlEQUFpRDtBQUNqRCwyQ0FBMkM7QUFFM0MseURBQXlEO0FBRXpELDREQUE0RDtBQUM1RCx5Q0FBd0M7QUFDeEMsNkNBQTRDO0FBUTVDLE1BQWEsY0FBZSxTQUFRLHlCQUFXO0lBRzdDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBcUI7UUFDN0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixvQ0FBb0M7UUFDcEMsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwRCwyQkFBMkIsRUFBRTtnQkFDM0IsWUFBWSxFQUFFLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUM3RixZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2FBQzFDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsa0RBQWtEO1FBQ2xELE1BQU0sY0FBYyxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDakUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsb0NBQW9DLENBQUM7WUFDakUsT0FBTyxFQUFFLGVBQWU7WUFDeEIsT0FBTyxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM3QixXQUFXLEVBQUU7Z0JBQ1gscUJBQXFCLEVBQUUs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LE1BQU0sRUFBRSxVQUFVO2FBQ25CO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBNUdELHdDQTRHQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuLy8gU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IE1JVC0wXG5cbmltcG9ydCB7IE5lc3RlZFN0YWNrLCBEdXJhdGlvbiwgUmVtb3ZhbFBvbGljeSB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgb3BlbnNlYXJjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtb3BlbnNlYXJjaHNlcnZpY2UnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIGZpcmVob3NlIGZyb20gJ2F3cy1jZGstbGliL2F3cy1raW5lc2lzZmlyZWhvc2UnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJ1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncydcblxuZXhwb3J0IGludGVyZmFjZSBNZXRyaWNBcGlQcm9wcyB7XG4gIGVsYXN0aWNzZWFyY2hBcm4/OiBzdHJpbmcsXG4gIHN0cmVhbXNEaXN0cmlidXRpb246IGNsb3VkZnJvbnQuQ2xvdWRGcm9udFdlYkRpc3RyaWJ1dGlvbixcbiAgY3VzdG9tU3RyZWFtc1VybDogc3RyaW5nIHwgdW5kZWZpbmVkXG59XG5cbmV4cG9ydCBjbGFzcyBNZXRyaWNBcGlTdGFjayBleHRlbmRzIE5lc3RlZFN0YWNrIHtcbiAgcHVibGljIGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBNZXRyaWNBcGlQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgYSBSRVNUIEFQSSBmb3Igb3VyIG1ldHJpY3NcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ01ldHJpY3NBcGknLCB7XG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBwcm9wcy5jdXN0b21TdHJlYW1zVXJsID8gW3Byb3BzLmN1c3RvbVN0cmVhbXNVcmxdIDogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYSBMYW1iZGEgZnVuY3Rpb24gdG8gaGFuZGxlIEFQSSByZXF1ZXN0c1xuICAgIGNvbnN0IG1ldHJpY3NIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnTWV0cmljc0hhbmRsZXInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi9yZXNvdXJjZXMvbGFtYmRhL21ldHJpY3MtaGFuZGxlcicpLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBPUEVOU0VBUkNIX0RPTUFJTl9BUk46IHByb3BzLmVsYXN0aWNzZWFyY2hBcm4gfHwgJycsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBlcm1pc3Npb25zIGZvciB0aGUgTGFtYmRhIHRvIGFjY2VzcyBPcGVuU2VhcmNoXG4gICAgaWYgKHByb3BzLmVsYXN0aWNzZWFyY2hBcm4pIHtcbiAgICAgIGNvbnN0IGVzUG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgXCJlczpFU0h0dHBHZXRcIixcbiAgICAgICAgICBcImVzOkVTSHR0cFBvc3RcIixcbiAgICAgICAgICBcImVzOkVTSHR0cFB1dFwiLFxuICAgICAgICAgIFwiZXM6RVNIdHRwRGVsZXRlXCIsXG4gICAgICAgICAgXCJlczpFU0h0dHBIZWFkXCIsXG4gICAgICAgICAgXCJlczpFU0h0dHBQYXRjaFwiLFxuICAgICAgICAgIFwiZXM6RGVzY3JpYmVFbGFzdGljc2VhcmNoRG9tYWluXCIsXG4gICAgICAgICAgXCJlczpEZXNjcmliZUVsYXN0aWNzZWFyY2hEb21haW5zXCIsXG4gICAgICAgICAgXCJlczpEZXNjcmliZUVsYXN0aWNzZWFyY2hEb21haW5Db25maWdcIixcbiAgICAgICAgICBcImVzOkxpc3REb21haW5OYW1lc1wiLFxuICAgICAgICAgIFwiZXM6TGlzdFRhZ3NcIixcbiAgICAgICAgICBcImVzOkdldFVwZ3JhZGVTdGF0dXNcIixcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgcHJvcHMuZWxhc3RpY3NlYXJjaEFybixcbiAgICAgICAgICBgJHtwcm9wcy5lbGFzdGljc2VhcmNoQXJufS8qYFxuICAgICAgICBdLFxuICAgICAgfSk7XG4gICAgICBtZXRyaWNzSGFuZGxlci5hZGRUb1JvbGVQb2xpY3koZXNQb2xpY3kpO1xuXG4gICAgICAvLyBBZGQgcGVybWlzc2lvbnMgZm9yIE9wZW5TZWFyY2ggU2VydmljZVxuICAgICAgY29uc3Qgb3NQb2xpY3kgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICBcImFvc3M6QVBJQWNjZXNzQWxsXCIsXG4gICAgICAgICAgXCJhb3NzOkRlc2NyaWJlRG9tYWluXCIsXG4gICAgICAgICAgXCJhb3NzOkRlc2NyaWJlRG9tYWluc1wiLFxuICAgICAgICAgIFwiYW9zczpEZXNjcmliZURvbWFpbkNvbmZpZ1wiLFxuICAgICAgICAgIFwiYW9zczpMaXN0RG9tYWluTmFtZXNcIixcbiAgICAgICAgICBcImFvc3M6TGlzdFRhZ3NcIixcbiAgICAgICAgICBcImFvc3M6R2V0VXBncmFkZVN0YXR1c1wiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBwcm9wcy5lbGFzdGljc2VhcmNoQXJuLFxuICAgICAgICAgIGAke3Byb3BzLmVsYXN0aWNzZWFyY2hBcm59LypgXG4gICAgICAgIF0sXG4gICAgICB9KTtcbiAgICAgIG1ldHJpY3NIYW5kbGVyLmFkZFRvUm9sZVBvbGljeShvc1BvbGljeSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIGFuIEFQSSBHYXRld2F5IGludGVncmF0aW9uIHdpdGggdGhlIExhbWJkYSBmdW5jdGlvblxuICAgIGNvbnN0IG1ldHJpY3NJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKG1ldHJpY3NIYW5kbGVyKTtcbiAgICBcbiAgICAvLyBBZGQgcm91dGVzIHRvIHRoZSBBUElcbiAgICBjb25zdCBtZXRyaWNzID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnbWV0cmljcycpO1xuICAgIG1ldHJpY3MuYWRkTWV0aG9kKCdHRVQnLCBtZXRyaWNzSW50ZWdyYXRpb24pO1xuICAgIG1ldHJpY3MuYWRkTWV0aG9kKCdQT1NUJywgbWV0cmljc0ludGVncmF0aW9uKTtcbiAgICBcbiAgICAvLyBDcmVhdGUgYSBGaXJlaG9zZSBkZWxpdmVyeSBzdHJlYW0gZm9yIG1ldHJpY3MgZGF0YVxuICAgIGNvbnN0IG1ldHJpY3NMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdNZXRyaWNzTG9nR3JvdXAnKTtcbiAgICBcbiAgICBjb25zdCBmaXJlaG9zZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0ZpcmVob3NlUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdmaXJlaG9zZS5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgbWV0cmljc0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ01ldHJpY3NCdWNrZXQnLCB7XG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICB9KTtcbiAgICBcbiAgICBtZXRyaWNzQnVja2V0LmdyYW50UmVhZFdyaXRlKGZpcmVob3NlUm9sZSk7XG4gICAgXG4gICAgY29uc3QgbWV0cmljc0RlbGl2ZXJ5U3RyZWFtID0gbmV3IGZpcmVob3NlLkNmbkRlbGl2ZXJ5U3RyZWFtKHRoaXMsICdNZXRyaWNzRGVsaXZlcnlTdHJlYW0nLCB7XG4gICAgICBleHRlbmRlZFMzRGVzdGluYXRpb25Db25maWd1cmF0aW9uOiB7XG4gICAgICAgIGJ1Y2tldEFybjogbWV0cmljc0J1Y2tldC5idWNrZXRBcm4sXG4gICAgICAgIHJvbGVBcm46IGZpcmVob3NlUm9sZS5yb2xlQXJuLFxuICAgICAgICBidWZmZXJpbmdIaW50czoge1xuICAgICAgICAgIGludGVydmFsSW5TZWNvbmRzOiA2MCxcbiAgICAgICAgICBzaXplSW5NQnM6IDFcbiAgICAgICAgfSxcbiAgICAgICAgY2xvdWRXYXRjaExvZ2dpbmdPcHRpb25zOiB7XG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBsb2dHcm91cE5hbWU6IG1ldHJpY3NMb2dHcm91cC5sb2dHcm91cE5hbWUsXG4gICAgICAgICAgbG9nU3RyZWFtTmFtZTogJ1MzRGVsaXZlcnknXG4gICAgICAgIH0sXG4gICAgICAgIGNvbXByZXNzaW9uRm9ybWF0OiAnVU5DT01QUkVTU0VEJyxcbiAgICAgICAgcHJlZml4OiAnbWV0cmljcy8nLFxuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG4iXX0=