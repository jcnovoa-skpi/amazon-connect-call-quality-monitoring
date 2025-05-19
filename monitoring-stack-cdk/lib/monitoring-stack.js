"use strict";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
Object.defineProperty(exports, "__esModule", { value: true });
const aws_cdk_lib_1 = require("aws-cdk-lib");
const streamsgenerator_stack_1 = require("./streamsgenerator-stack");
const metricapi_stack_1 = require("./metricapi-stack");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const s3 = require("aws-cdk-lib/aws-s3");
const s3deployment = require("aws-cdk-lib/aws-s3-deployment");
const elasticSearchStack = require("./elasticsearch-stack");
class MonitoringStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id) {
        super(scope, id);
        const customStreamsUrl = process.env.STREAMS_URL;
        if (customStreamsUrl != undefined &&
            (!(customStreamsUrl === null || customStreamsUrl === void 0 ? void 0 : customStreamsUrl.startsWith('https://')) || customStreamsUrl.endsWith('/'))) {
            throw (new Error("Custom Streams URL must begin with https:// and not contain trailing slash"));
        }
        const ccpUrl = process.env.CCP_URL;
        if (ccpUrl == undefined
            || !ccpUrl.startsWith('https://')
            || !(ccpUrl.includes('.awsapps.com') || ccpUrl.includes('.my.connect.aws'))
            || !ccpUrl.includes('/ccp-v2')) {
            throw (new Error('CCP URL must be the https:// url to your ccp-v2 softphone'));
        }
        // Make OpenSearch deployment optional
        const deployOpenSearch = process.env.DEPLOY_OPENSEARCH !== 'false';
        const elasticsearchStackDeployment = (process.env.ES_DOMAIN_ENDPOINT == undefined && deployOpenSearch) ?
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
        const metricApiStack = new metricapi_stack_1.MetricApiStack(this, 'MetricApiStack', {
            elasticsearchArn: elasticsearchStackDeployment == undefined ? undefined : elasticsearchStackDeployment.elasticsearchArn,
            streamsDistribution,
            customStreamsUrl,
        });
        const streamsGeneratorStack = new streamsgenerator_stack_1.StreamsGeneratorStack(this, 'StreamsGeneratorStack', {
            ccpUrl,
            api: metricApiStack.api,
            streamsBucket,
            streamsDistribution,
            streamsAsset: s3deployment.Source.asset('./resources/streams'),
        });
        new aws_cdk_lib_1.CfnOutput(this, 'StreamsUrl', {
            value: `https://${streamsDistribution.distributionDomainName}`,
        });
        new aws_cdk_lib_1.CfnOutput(this, 'UserCreateUrl', {
            value: elasticsearchStackDeployment == undefined ? "OpenSearch not deployed" : elasticsearchStackDeployment.getUserCreateUrl().toString(),
        });
        new aws_cdk_lib_1.CfnOutput(this, 'KibanaUrl', {
            value: elasticsearchStackDeployment == undefined ? "OpenSearch not deployed" : elasticsearchStackDeployment.getKibanaUrl().toString(),
        });
    }
}
exports.default = MonitoringStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vbml0b3Jpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLHFFQUFxRTtBQUNyRSxpQ0FBaUM7O0FBRWpDLDZDQUE4RDtBQUU5RCxxRUFBaUU7QUFDakUsdURBQW1EO0FBQ25ELHlEQUF5RDtBQUd6RCx5Q0FBeUM7QUFDekMsOERBQThEO0FBQzlELDREQUE2RDtBQUU3RCxNQUFxQixlQUFnQixTQUFRLG1CQUFLO0lBQ2hELFlBQVksS0FBZ0IsRUFBRSxFQUFVO1FBQ3RDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQztRQUNqRCxJQUFJLGdCQUFnQixJQUFJLFNBQVM7WUFDL0IsQ0FBRSxDQUFDLENBQUEsZ0JBQWdCLGFBQWhCLGdCQUFnQix1QkFBaEIsZ0JBQWdCLENBQUUsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFBLElBQUksZ0JBQWdCLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFFLEVBQUMsQ0FBQztZQUNqRixNQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsNEVBQTRFLENBQUMsQ0FBQyxDQUFDO1FBQ2pHLENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQztRQUNuQyxJQUNFLE1BQU0sSUFBSSxTQUFTO2VBQ2hCLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUM7ZUFDOUIsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2VBQ3hFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRyxDQUFDO1lBQ2hDLE1BQUssQ0FBQyxJQUFJLEtBQUssQ0FBQywyREFBMkQsQ0FBQyxDQUFDLENBQUM7UUFDaEYsQ0FBQztRQUVILHNDQUFzQztRQUN0QyxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEtBQUssT0FBTyxDQUFDO1FBRW5FLE1BQU0sNEJBQTRCLEdBQ2hDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxTQUFTLElBQUksZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO1lBQ2pFLElBQUksa0JBQWtCLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO2dCQUNwRSxNQUFNO2FBQ1AsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFbkIsMEVBQTBFO1FBQzFFLE1BQU0sYUFBYSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3pELG9CQUFvQixFQUFFLFlBQVk7WUFDbEMsb0JBQW9CLEVBQUUsWUFBWTtZQUNsQyxnQ0FBZ0M7U0FDakMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLFVBQVUsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDaEcsYUFBYSxFQUFFO2dCQUNiO29CQUNFLGNBQWMsRUFBRTt3QkFDZCxjQUFjLEVBQUUsYUFBYTt3QkFDN0Isc0VBQXNFO3dCQUN0RSxvQkFBb0IsRUFBRSxJQUFJLFVBQVUsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLENBQUM7cUJBQ3BGO29CQUNELFNBQVMsRUFBRSxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLENBQUM7aUJBQ3pDO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBRyxJQUFJLGdDQUFjLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ2hFLGdCQUFnQixFQUFFLDRCQUE0QixJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyw0QkFBNkIsQ0FBQyxnQkFBZ0I7WUFDeEgsbUJBQW1CO1lBQ25CLGdCQUFnQjtTQUNqQixDQUFDLENBQUM7UUFFSCxNQUFNLHFCQUFxQixHQUFHLElBQUksOENBQXFCLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQ3JGLE1BQU07WUFDTixHQUFHLEVBQUUsY0FBYyxDQUFDLEdBQUc7WUFDdkIsYUFBYTtZQUNiLG1CQUFtQjtZQUNuQixZQUFZLEVBQUUsWUFBWSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUM7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDaEMsS0FBSyxFQUFFLFdBQVcsbUJBQW1CLENBQUMsc0JBQXNCLEVBQUU7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDbkMsS0FBSyxFQUFFLDRCQUE0QixJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLDRCQUE2QixDQUFDLGdCQUFnQixFQUFFLENBQUMsUUFBUSxFQUFFO1NBQzNJLENBQUMsQ0FBQztRQUVILElBQUksdUJBQVMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFO1lBQy9CLEtBQUssRUFBRSw0QkFBNEIsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyw0QkFBNkIsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxRQUFRLEVBQUU7U0FDdkksQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBekVELGtDQXlFQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuLy8gU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IE1JVC0wXG5cbmltcG9ydCB7IFN0YWNrLCBBcHAsIENmbk91dHB1dCwgRHVyYXRpb24gfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IFN0cmVhbXNHZW5lcmF0b3JTdGFjayB9IGZyb20gJy4vc3RyZWFtc2dlbmVyYXRvci1zdGFjayc7XG5pbXBvcnQgeyBNZXRyaWNBcGlTdGFjayB9IGZyb20gJy4vbWV0cmljYXBpLXN0YWNrJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgY3VzdG9tUmVzb3VyY2UgZnJvbSAnYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlcyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgczNkZXBsb3ltZW50IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50JztcbmltcG9ydCBlbGFzdGljU2VhcmNoU3RhY2sgPSByZXF1aXJlKCcuL2VsYXN0aWNzZWFyY2gtc3RhY2snKTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTW9uaXRvcmluZ1N0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IGN1c3RvbVN0cmVhbXNVcmwgPSBwcm9jZXNzLmVudi5TVFJFQU1TX1VSTDtcbiAgICBpZiAoY3VzdG9tU3RyZWFtc1VybCAhPSB1bmRlZmluZWQgJiZcbiAgICAgICggIWN1c3RvbVN0cmVhbXNVcmw/LnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykgfHwgY3VzdG9tU3RyZWFtc1VybC5lbmRzV2l0aCgnLycpICkpe1xuICAgICAgdGhyb3cobmV3IEVycm9yKFwiQ3VzdG9tIFN0cmVhbXMgVVJMIG11c3QgYmVnaW4gd2l0aCBodHRwczovLyBhbmQgbm90IGNvbnRhaW4gdHJhaWxpbmcgc2xhc2hcIikpO1xuICAgIH1cbiAgICBjb25zdCBjY3BVcmwgPSBwcm9jZXNzLmVudi5DQ1BfVVJMO1xuICAgIGlmIChcbiAgICAgIGNjcFVybCA9PSB1bmRlZmluZWQgXG4gICAgICB8fCAhY2NwVXJsLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykgXG4gICAgICB8fCAhKGNjcFVybC5pbmNsdWRlcygnLmF3c2FwcHMuY29tJykgfHwgY2NwVXJsLmluY2x1ZGVzKCcubXkuY29ubmVjdC5hd3MnKSlcbiAgICAgIHx8ICFjY3BVcmwuaW5jbHVkZXMoJy9jY3AtdjInKSApIHtcbiAgICAgICAgdGhyb3cobmV3IEVycm9yKCdDQ1AgVVJMIG11c3QgYmUgdGhlIGh0dHBzOi8vIHVybCB0byB5b3VyIGNjcC12MiBzb2Z0cGhvbmUnKSk7XG4gICAgICB9XG5cbiAgICAvLyBNYWtlIE9wZW5TZWFyY2ggZGVwbG95bWVudCBvcHRpb25hbFxuICAgIGNvbnN0IGRlcGxveU9wZW5TZWFyY2ggPSBwcm9jZXNzLmVudi5ERVBMT1lfT1BFTlNFQVJDSCAhPT0gJ2ZhbHNlJztcbiAgICBcbiAgICBjb25zdCBlbGFzdGljc2VhcmNoU3RhY2tEZXBsb3ltZW50ID0gXG4gICAgICAocHJvY2Vzcy5lbnYuRVNfRE9NQUlOX0VORFBPSU5UID09IHVuZGVmaW5lZCAmJiBkZXBsb3lPcGVuU2VhcmNoKSA/IFxuICAgICAgICBuZXcgZWxhc3RpY1NlYXJjaFN0YWNrLkVsYXN0aWNTZWFyY2hTdGFjayh0aGlzLCAnRWxhc3RpY1NlYXJjaFN0YWNrJywge1xuICAgICAgICAgIGNjcFVybCxcbiAgICAgICAgfSkgOiB1bmRlZmluZWQ7XG5cbiAgICAvLyBDcmVhdGUgUzMgYnVja2V0IHdpdGggd2Vic2l0ZSBob3N0aW5nIGVuYWJsZWQgYnV0IHdpdGhvdXQgcHVibGljIGFjY2Vzc1xuICAgIGNvbnN0IHN0cmVhbXNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdTdHJlYW1zQnVja2V0Jywge1xuICAgICAgd2Vic2l0ZUluZGV4RG9jdW1lbnQ6ICdpbmRleC5odG1sJyxcbiAgICAgIHdlYnNpdGVFcnJvckRvY3VtZW50OiAnZXJyb3IuaHRtbCcsXG4gICAgICAvLyBSZW1vdmUgcHVibGljUmVhZEFjY2VzczogdHJ1ZVxuICAgIH0pO1xuXG4gICAgY29uc3Qgc3RyZWFtc0Rpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkNsb3VkRnJvbnRXZWJEaXN0cmlidXRpb24odGhpcywgJ1N0cmVhbXNEaXN0cmlidXRpb24nLCB7XG4gICAgICBvcmlnaW5Db25maWdzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzM09yaWdpblNvdXJjZToge1xuICAgICAgICAgICAgczNCdWNrZXRTb3VyY2U6IHN0cmVhbXNCdWNrZXQsXG4gICAgICAgICAgICAvLyBBZGQgb3JpZ2luIGFjY2VzcyBpZGVudGl0eSB0byBhbGxvdyBDbG91ZEZyb250IHRvIGFjY2VzcyB0aGUgYnVja2V0XG4gICAgICAgICAgICBvcmlnaW5BY2Nlc3NJZGVudGl0eTogbmV3IGNsb3VkZnJvbnQuT3JpZ2luQWNjZXNzSWRlbnRpdHkodGhpcywgJ1N0cmVhbXNCdWNrZXRPQUknKVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYmVoYXZpb3JzOiBbeyBpc0RlZmF1bHRCZWhhdmlvcjogdHJ1ZSB9XSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBtZXRyaWNBcGlTdGFjayA9IG5ldyBNZXRyaWNBcGlTdGFjayh0aGlzLCAnTWV0cmljQXBpU3RhY2snLCB7XG4gICAgICBlbGFzdGljc2VhcmNoQXJuOiBlbGFzdGljc2VhcmNoU3RhY2tEZXBsb3ltZW50ID09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGVsYXN0aWNzZWFyY2hTdGFja0RlcGxveW1lbnQhLmVsYXN0aWNzZWFyY2hBcm4sXG4gICAgICBzdHJlYW1zRGlzdHJpYnV0aW9uLFxuICAgICAgY3VzdG9tU3RyZWFtc1VybCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHN0cmVhbXNHZW5lcmF0b3JTdGFjayA9IG5ldyBTdHJlYW1zR2VuZXJhdG9yU3RhY2sodGhpcywgJ1N0cmVhbXNHZW5lcmF0b3JTdGFjaycsIHtcbiAgICAgIGNjcFVybCxcbiAgICAgIGFwaTogbWV0cmljQXBpU3RhY2suYXBpLFxuICAgICAgc3RyZWFtc0J1Y2tldCxcbiAgICAgIHN0cmVhbXNEaXN0cmlidXRpb24sXG4gICAgICBzdHJlYW1zQXNzZXQ6IHMzZGVwbG95bWVudC5Tb3VyY2UuYXNzZXQoJy4vcmVzb3VyY2VzL3N0cmVhbXMnKSxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1N0cmVhbXNVcmwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtzdHJlYW1zRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ1VzZXJDcmVhdGVVcmwnLCB7XG4gICAgICB2YWx1ZTogZWxhc3RpY3NlYXJjaFN0YWNrRGVwbG95bWVudCA9PSB1bmRlZmluZWQgPyBcIk9wZW5TZWFyY2ggbm90IGRlcGxveWVkXCIgOiBlbGFzdGljc2VhcmNoU3RhY2tEZXBsb3ltZW50IS5nZXRVc2VyQ3JlYXRlVXJsKCkudG9TdHJpbmcoKSxcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ0tpYmFuYVVybCcsIHtcbiAgICAgIHZhbHVlOiBlbGFzdGljc2VhcmNoU3RhY2tEZXBsb3ltZW50ID09IHVuZGVmaW5lZCA/IFwiT3BlblNlYXJjaCBub3QgZGVwbG95ZWRcIiA6IGVsYXN0aWNzZWFyY2hTdGFja0RlcGxveW1lbnQhLmdldEtpYmFuYVVybCgpLnRvU3RyaW5nKCksXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==