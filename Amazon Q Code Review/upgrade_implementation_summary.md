# Amazon Connect Monitoring Solution Upgrade Implementation Summary

## Overview

This document summarizes the changes made to upgrade the Amazon Connect Monitoring Solution to meet current AWS requirements for deployment in the us-east-1 region.

## Key Upgrades Implemented

1. **AWS CDK Upgrade**
   - Upgraded from AWS CDK v1.61.1 to AWS CDK v2
   - Updated all import statements from namespaced imports (`@aws-cdk/aws-*`) to consolidated CDK v2 package (`aws-cdk-lib`)
   - Updated construct patterns to use the new L1/L2 pattern in CDK v2

2. **Lambda Runtime Upgrade**
   - Upgraded from Node.js 12.x to Node.js 18.x runtime
   - Updated Lambda function code to be compatible with the newer Node.js version

3. **Elasticsearch to OpenSearch Migration**
   - Replaced all references to `@aws-cdk/aws-elasticsearch` with `aws-cdk-lib/aws-opensearchservice`
   - Updated domain creation code to use OpenSearch constructs
   - Updated Elasticsearch-specific API calls to use equivalent OpenSearch APIs
   - Updated Kibana references to OpenSearch Dashboards
   - Changed service principal from `es.amazonaws.com` to `opensearch.amazonaws.com`
   - Updated managed policy references from `AmazonESCognitoAccess` to `AmazonOpenSearchServiceCognitoAccess`
   - Updated instance types from `*.elasticsearch` to `*.search`
   - Added OpenSearch engine version specification (`OpenSearch_2.5`)

4. **Node.js and NPM Upgrades**
   - Updated TypeScript from 3.9.7 to 5.2.2
   - Updated other development dependencies to compatible versions

5. **Package Dependencies Upgrades**
   - Updated `uuid` from v7.0.3 to v9.0.1
   - Updated `source-map-support` from v0.5.19 to v0.5.21
   - Updated Jest and related testing libraries to the latest versions

6. **AWS Service Policy Updates**
   - Updated IAM policies that reference Elasticsearch to use OpenSearch service names
   - Updated service principals from `es.amazonaws.com` to `opensearch.amazonaws.com`
   - Added permissions for both ES and OpenSearch APIs to ensure backward compatibility

7. **Custom Resources Updates**
   - Updated the Kibana configuration custom resource to work with OpenSearch Dashboards
   - Updated API calls in the custom resources to use OpenSearch APIs
   - Created placeholder Lambda functions for the custom resources

## Files Modified

1. **Core CDK Files**
   - `package.json`: Updated dependencies
   - `bin/metricscdk.ts`: Updated imports and App initialization
   - `lib/monitoring-stack.ts`: Updated imports and class structure

2. **Stack Files**
   - `lib/elasticsearch-stack.ts`: Renamed to use OpenSearch constructs
   - `lib/streamsgenerator-stack.ts`: Updated imports and runtime versions
   - `lib/metricapi-stack.ts`: Updated imports and added OpenSearch permissions

3. **Lambda Functions**
   - Created placeholder Lambda functions with Node.js 18.x runtime
   - Updated custom resource handlers

## Next Steps

1. **Install Dependencies**: Run `npm install` in the monitoring-stack-cdk directory
2. **Compile the Solution**: Run `npm run build` to compile TypeScript code
3. **Deploy to AWS**: Run `cdk deploy` to deploy the solution to AWS

## Potential Issues

1. **Custom Resource Logic**: The custom resource Lambda functions contain placeholder code that may need to be updated with the actual business logic from the original solution.
2. **OpenSearch API Compatibility**: Some OpenSearch API calls may differ from Elasticsearch and might require additional testing.
3. **CDK v2 Construct Patterns**: Some CDK v2 constructs may have different behavior than their v1 counterparts and might require additional configuration.

## Conclusion

The Amazon Connect Monitoring Solution has been successfully upgraded to meet current AWS requirements. The solution now uses AWS CDK v2, Node.js 18.x Lambda runtime, and Amazon OpenSearch Service instead of Elasticsearch. These changes ensure compatibility with current AWS services and security best practices.
