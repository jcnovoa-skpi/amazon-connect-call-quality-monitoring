# Amazon Connect Monitoring Solution Deployment Issues

## Current Status

We've attempted to deploy the Amazon Connect Monitoring Solution with a new stack name (`AmazonConnectMonitoringStack`), but encountered an issue with the OpenSearch domain creation.

## Error Details

The deployment failed with the following error:

```
Resource handler returned message: "Invalid request provided: Amazon OpenSearch Service must be allowed to use the passed role (Service: OpenSearch, Status Code: 400, Request ID: 88e56183-6bc2-441f-b059-9d32252da196) (SDK Attempt Count: 1)"
```

## Root Cause Analysis

This error occurs because OpenSearch Service needs explicit permission to assume the IAM role we're providing. Even though we've added a trust relationship to the role, there's an additional step required: OpenSearch Service needs to be explicitly allowed to use the role.

## Possible Solutions

1. **Create a Service-Linked Role for OpenSearch**:
   ```bash
   aws iam create-service-linked-role --aws-service-name es.amazonaws.com
   ```

2. **Modify the Trust Policy**:
   Update the trust policy of the IAM role to explicitly allow OpenSearch Service to assume it.

3. **Use a Pre-existing Domain**:
   Set the `ES_DOMAIN_ENDPOINT` environment variable to use an existing OpenSearch domain instead of creating a new one.

4. **Simplify the Deployment**:
   Create a version of the stack without the OpenSearch component for testing purposes.

## Next Steps

1. Create a service-linked role for OpenSearch:
   ```bash
   aws iam create-service-linked-role --aws-service-name es.amazonaws.com
   ```

2. Wait a few minutes for the role to propagate

3. Try the deployment again:
   ```bash
   cd /System/Volumes/Data/Development/AWS/amazon-connect-call-quality-monitoring/monitoring-stack-cdk
   MONITORING_STACK_NAME="AmazonConnectMonitoringStack" CCP_URL="https://demo-successkpi.my.connect.aws/ccp-v2/" cdk deploy --require-approval never
   ```

## Alternative Approach

If the above doesn't work, we could modify the stack to make the OpenSearch domain optional by checking for an environment variable:

```typescript
// In monitoring-stack.ts
const deployOpenSearch = process.env.DEPLOY_OPENSEARCH !== 'false';

const elasticsearchStackDeployment = 
  (process.env.ES_DOMAIN_ENDPOINT == undefined && deployOpenSearch) ? 
    new elasticSearchStack.ElasticSearchStack(this, 'ElasticSearchStack', {
      ccpUrl,
    }) : undefined;
```

Then deploy without OpenSearch:
```bash
DEPLOY_OPENSEARCH=false MONITORING_STACK_NAME="AmazonConnectMonitoringStack" CCP_URL="https://demo-successkpi.my.connect.aws/ccp-v2/" cdk deploy --require-approval never
```
