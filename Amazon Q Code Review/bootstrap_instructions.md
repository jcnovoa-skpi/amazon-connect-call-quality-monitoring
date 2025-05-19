# CDK Bootstrap Instructions

## Current Status

The attempt to bootstrap CDK in your AWS account failed due to insufficient permissions. The error message indicates:

```
AccessDenied: User: arn:aws:sts::992257105959:assumed-role/AWSReservedSSO_AmazonConnectAdmin_6cb89e30caf69344/j.c.novoa@corp.successkpi.com is not authorized to perform: cloudformation:DescribeStacks
```

## Required Permissions

To bootstrap CDK, you need the following permissions:
- CloudFormation permissions (CreateStack, DescribeStacks, etc.)
- IAM permissions to create roles and policies
- S3 permissions to create and manage buckets
- ECR permissions if you plan to use Docker assets

## Steps to Bootstrap CDK

1. **Obtain necessary permissions**:
   - Contact your AWS administrator to grant your role the necessary permissions
   - Alternatively, use an account with AdministratorAccess policy

2. **Set environment variables**:
   ```bash
   export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   export AWS_REGION=$(aws configure get region)
   ```

3. **Run the bootstrap command**:
   ```bash
   cdk bootstrap aws://$ACCOUNT_ID/$AWS_REGION
   ```

4. **Verify bootstrap success**:
   - Check for the CDKToolkit stack in CloudFormation console
   - Verify the creation of the CDK staging bucket in S3

## Alternative: Manual Bootstrap

If you cannot obtain the necessary permissions, ask your AWS administrator to bootstrap the environment for you by running:

```bash
cdk bootstrap aws://992257105959/us-east-1
```

Once bootstrapped, you may be able to deploy stacks even with more limited permissions.

## Next Steps After Bootstrapping

After successful bootstrapping:

1. Set the CCP_URL environment variable:
   ```bash
   export CCP_URL=<your-connect-ccp-url>
   ```

2. Deploy the stack:
   ```bash
   cd /System/Volumes/Data/Development/AWS/amazon-connect-call-quality-monitoring/monitoring-stack-cdk
   cdk deploy
   ```
