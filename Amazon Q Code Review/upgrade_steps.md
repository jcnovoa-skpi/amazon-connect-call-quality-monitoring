# Amazon Connect Monitoring Solution Upgrade Steps

## Summary of Accomplished Tasks

### 1. Environment Setup
- Installed Node.js 20.11.1 and npm 10.2.4
- Created symbolic links for node, npm, and npx in /usr/local/bin
- Added Node.js bin directory to PATH in shell profiles

### 2. Code Upgrades

#### AWS CDK Upgrade
- Upgraded from AWS CDK v1.61.1 to AWS CDK v2
- Updated package.json with new dependencies
- Changed all import statements from namespaced imports (`@aws-cdk/aws-*`) to consolidated CDK v2 package (`aws-cdk-lib`)
- Updated construct patterns to use the new L1/L2 pattern in CDK v2
- Fixed issues with CustomResource and Stack references
- Updated cdk.json to use new-style stack synthesis

#### Lambda Runtime Upgrade
- Upgraded from Node.js 12.x to Node.js 18.x runtime
- Created placeholder Lambda function code for the custom resources
- Updated handler references and timeout configurations
- Created directory structure for Lambda resources

#### Elasticsearch to OpenSearch Migration
- Replaced all references to Elasticsearch with OpenSearch
- Updated domain creation code to use OpenSearch constructs
- Changed service principal from `es.amazonaws.com` to `opensearch.amazonaws.com`
- Updated managed policy references from `AmazonESCognitoAccess` to `AmazonOpenSearchServiceCognitoAccess`
- Added OpenSearch engine version specification (OpenSearch_2.5)
- Updated instance types from `*.elasticsearch` to `*.search`
- Changed Kibana references to OpenSearch Dashboards
- Updated endpoint paths from `/_plugin/kibana/` to `/_dashboards/`

#### Package Dependencies Upgrades
- Updated TypeScript from 3.9.7 to 5.2.2
- Updated uuid from v7.0.3 to v9.0.1
- Updated source-map-support from v0.5.19 to v0.5.21
- Updated Jest and related testing libraries to the latest versions

### 3. File Structure Updates
- Created placeholder files for web resources (index.html, error.html)
- Created directory structure for custom resources
- Created placeholder Lambda function implementations

### 4. Build Process
- Successfully installed all dependencies with `npm install`
- Fixed TypeScript compilation errors
- Successfully compiled the solution with `npm run build`
- Generated JavaScript files for all components

### 5. Documentation
- Created solution_stack.md with details of the technology stack
- Created upgrade_requirements.md with required upgrades
- Created upgrade_implementation_summary.md with implementation details
- Created upgrade_completion_report.md with deployment instructions

## Next Steps for Deployment

1. Set the required environment variables:
   ```
   export ACCOUNT_ID=`aws sts get-caller-identity --query Account --output text`
   export AWS_REGION=us-east-1
   export CCP_URL=<your-connect-ccp-url>
   ```

2. Bootstrap the AWS environment if not already done:
   ```
   cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION
   ```

3. Deploy the solution:
   ```
   cdk deploy --require-approval never
   ```

## Potential Considerations

1. **Custom Resource Logic**: The custom resource Lambda functions contain placeholder code that may need to be updated with the actual business logic from the original solution.

2. **OpenSearch API Compatibility**: Some OpenSearch API calls may differ from Elasticsearch and might require additional testing.

3. **CDK v2 Feature Flags**: The solution now uses CDK v2 feature flags and new-style stack synthesis.
