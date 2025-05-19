# Upgrade Requirements for Amazon Connect Monitoring Solution

This document outlines the necessary upgrades required to meet minimum AWS requirements for deploying and running the Amazon Connect Call Quality Monitoring solution in the us-east-1 region.

## AWS CDK Upgrades

The solution currently uses AWS CDK v1.61.1, which is significantly outdated. AWS CDK v1 is now in maintenance mode, and AWS recommends using CDK v2.

### Required CDK Upgrades:
- Upgrade from AWS CDK v1.61.1 to AWS CDK v2 (latest stable version)
- Update import statements from namespaced imports (`@aws-cdk/aws-*`) to the consolidated CDK v2 package (`aws-cdk-lib`)
- Update construct libraries to use the new L1/L2 pattern in CDK v2

### Example changes:
```typescript
// Old CDK v1 imports
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as elasticsearch from '@aws-cdk/aws-elasticsearch';

// New CDK v2 imports
import { Stack, NestedStack, App } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
```

## Lambda Runtime Upgrades

The solution uses Node.js 12.x for Lambda functions, which reached end-of-life and is no longer supported by AWS Lambda.

### Required Lambda Runtime Upgrades:
- Upgrade from Node.js 12.x to Node.js 18.x (or the latest LTS version supported by Lambda)
- Update all Lambda function code to be compatible with the newer Node.js version
- Update the runtime specification in the CDK code:

```typescript
// Old runtime specification
runtime: lambda.Runtime.NODEJS_12_X,

// New runtime specification
runtime: lambda.Runtime.NODEJS_18_X,
```

## Elasticsearch to OpenSearch Migration

AWS Elasticsearch Service has been rebranded as Amazon OpenSearch Service. The solution needs to be updated to use OpenSearch instead of Elasticsearch.

### Required OpenSearch Upgrades:
- Replace all references to `@aws-cdk/aws-elasticsearch` with `aws-cdk-lib/aws-opensearchservice`
- Update the domain creation code to use OpenSearch constructs
- Update any Elasticsearch-specific API calls to use the equivalent OpenSearch APIs
- Update Kibana references to OpenSearch Dashboards where appropriate

### Example changes:
```typescript
// Old Elasticsearch import and usage
import * as elasticsearch from '@aws-cdk/aws-elasticsearch';
const domain = new elasticsearch.CfnDomain(this, 'Domain', {
  // properties
});

// New OpenSearch import and usage
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
const domain = new opensearch.Domain(this, 'Domain', {
  // properties
});
```

## Node.js and NPM Upgrades

The development environment should be updated to use more recent versions of Node.js and related tools.

### Required Node.js Upgrades:
- Upgrade Node.js to at least version 16.x (preferably 18.x or 20.x)
- Update TypeScript to version 4.x or later (current is 3.9.7)
- Update other development dependencies to compatible versions

## Package Dependencies Upgrades

Several package dependencies need to be updated to their latest versions for security and compatibility reasons.

### Required Package Upgrades:
- Update `uuid` from v7.0.3 to the latest version
- Update `source-map-support` from v0.5.19 to the latest version
- Update Jest and related testing libraries to the latest versions
- Update all other dependencies to versions compatible with Node.js 18.x

## AWS Service Policy Updates

AWS service policies and IAM roles may need updates to reflect changes in service names and permissions.

### Required Policy Updates:
- Update any IAM policies that reference Elasticsearch to use OpenSearch service names instead
- Update any service principals from `es.amazonaws.com` to `opensearch.amazonaws.com`
- Review and update any custom resource implementations that interact with Elasticsearch/OpenSearch

## Custom Resources Updates

The solution uses custom resources for Kibana configuration which will need to be updated for OpenSearch Dashboards.

### Required Custom Resource Updates:
- Update the Kibana configuration custom resource to work with OpenSearch Dashboards
- Update any API calls in the custom resources to use OpenSearch APIs
- Update the form-data dependency to the latest version

## Summary of Version Upgrades

| Component | Current Version | Recommended Version |
|-----------|----------------|---------------------|
| AWS CDK | 1.61.1 | 2.x (latest) |
| Node.js Lambda Runtime | 12.x | 18.x |
| TypeScript | 3.9.7 | 5.x |
| Elasticsearch | AWS Elasticsearch | Amazon OpenSearch Service |
| Node.js Development | 10.x-12.x | 18.x or 20.x |
| uuid | 7.0.3 | 9.x |
| Jest | 26.4.2 | 29.x |

## Implementation Strategy

1. Create a new branch for the upgrade work
2. First upgrade the CDK version and fix all related import statements
3. Update the Elasticsearch references to OpenSearch
4. Update the Lambda runtime versions
5. Update all other dependencies
6. Test the deployment in a development environment
7. Address any issues that arise during testing
8. Document any breaking changes or migration steps for users

## Additional Considerations

- The upgrade process may require changes to the solution's architecture to accommodate service changes
- Users may need to migrate existing Elasticsearch domains to OpenSearch
- Documentation should be updated to reflect the new service names and versions
- Consider adding automated tests to verify the functionality after upgrades
