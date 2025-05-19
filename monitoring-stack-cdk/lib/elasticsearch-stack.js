"use strict";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElasticSearchStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const opensearch = require("aws-cdk-lib/aws-opensearchservice");
const customResources = require("aws-cdk-lib/custom-resources");
class ElasticSearchStack extends aws_cdk_lib_1.NestedStack {
    constructor(scope, id, props) {
        super(scope, id);
        if (process.env.ES_DOMAIN_ENDPOINT != undefined) {
            //future releases should have both paths use the Domain construct
            this.elasticsearchArn = opensearch.Domain.fromDomainEndpoint(this, "Existing Domain", process.env.ES_DOMAIN_ENDPOINT).domainArn.replace('search-', '');
        }
        else {
            this.ccpUrl = props.ccpUrl;
            // get a unique suffix from the stackId
            const suffix = aws_cdk_lib_1.Fn.select(3, aws_cdk_lib_1.Fn.split('-', aws_cdk_lib_1.Fn.select(2, aws_cdk_lib_1.Fn.split('/', this.stackId))));
            // Get the name of the connect instance from the ccp url
            // Parsing depends on style of Connect URL being used (depends on when Connect resource was created)
            var substringPattern;
            // old-style URLs for Connect
            if (this.ccpUrl.includes('.awsapps.com')) {
                substringPattern = '.awsapps.com';
            }
            // new-style URLs for Connect
            else if (this.ccpUrl.includes('.my.connect.aws')) {
                substringPattern = '.my.connect.aws';
            }
            else {
                throw new Error('Unsupported Connect URL format, expected "xxx.awsapps.com" or "xxx.my.connect.aws"!');
            }
            this.ccpName = this.ccpUrl.substring(this.ccpUrl.indexOf('//') + 2, this.ccpUrl.indexOf(substringPattern));
            if (this.ccpName.length > 24) {
                this.ccpName = this.ccpName.substring(0, 24);
            }
            this.cognitoPools = this.createCognitoPools(suffix);
            const iamResources = this.createIamResources(this.cognitoPools.identityPool);
            this.opensearchDomain = this.createElasticsearchDomain(this.cognitoPools, iamResources);
            this.elasticsearchArn = this.opensearchDomain.attrArn;
        }
    }
    createCognitoPools(suffix) {
        const userPool = new cognito.CfnUserPool(this, 'userPool', {
            adminCreateUserConfig: {
                allowAdminCreateUserOnly: true,
            },
            policies: { passwordPolicy: { minimumLength: 8 } },
            usernameAttributes: ['email'],
            autoVerifiedAttributes: ['email'],
        });
        new cognito.CfnUserPoolDomain(this, 'cognitoDomain', {
            domain: `${this.ccpName.toLowerCase()}-${suffix}`,
            userPoolId: userPool.ref,
        });
        const idPool = new cognito.CfnIdentityPool(this, 'identityPool', {
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [],
        });
        return {
            identityPool: idPool.ref,
            userPool: userPool.ref,
        };
    }
    createIamResources(identityPool) {
        const authRole = new iam.Role(this, 'authRole', {
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool },
                'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
            }, 'sts:AssumeRoleWithWebIdentity'),
        });
        const esRole = new iam.Role(this, 'esRole', {
            assumedBy: new iam.ServicePrincipal('opensearch.amazonaws.com'),
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceCognitoAccess')],
        });
        // Add a trust relationship to allow OpenSearch to assume the role
        esRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            resources: ['*']
        }));
        const policy = new iam.PolicyDocument();
        policy.addStatements(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [
                new iam.AccountPrincipal(aws_cdk_lib_1.Stack.of(this).account),
                new iam.ArnPrincipal(authRole.roleArn),
            ],
            actions: ['es:*'],
            resources: [`arn:aws:es:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:domain/*/*`],
        }));
        new cognito.CfnIdentityPoolRoleAttachment(this, 'userPoolRoleAttachment', {
            identityPoolId: identityPool,
            roles: {
                authenticated: authRole.roleArn,
            },
        });
        return {
            authRole,
            esRole,
            elasticsearchAccessPolicy: policy,
        };
    }
    createElasticsearchDomain(cognitoPools, iamResources) {
        const opensearchDomain = new opensearch.CfnDomain(this, 'OpenSearchDomain', {
            accessPolicies: iamResources.elasticsearchAccessPolicy,
            encryptionAtRestOptions: {
                enabled: true,
            },
            ebsOptions: {
                ebsEnabled: true,
                volumeSize: 100, // Reduced from 1000 for faster deployment
                volumeType: 'gp2',
            },
            engineVersion: 'OpenSearch_2.5',
            clusterConfig: {
                dedicatedMasterCount: 3,
                dedicatedMasterEnabled: true,
                dedicatedMasterType: 'c5.large.search',
                instanceCount: 2, // Reduced from 3 for faster deployment
                instanceType: 'r5.large.search', // Changed from r5.2xlarge for faster deployment
                zoneAwarenessEnabled: true,
                zoneAwarenessConfig: {
                    availabilityZoneCount: 2, // Changed from 3 to match instanceCount
                },
            },
            domainEndpointOptions: {
                enforceHttps: true,
                tlsSecurityPolicy: 'Policy-Min-TLS-1-2-2019-07'
            },
            cognitoOptions: {
                enabled: true,
                identityPoolId: cognitoPools.identityPool,
                roleArn: iamResources.esRole.roleArn,
                userPoolId: cognitoPools.userPool
            }
        });
        this.configureElasticsearchDomain(opensearchDomain);
        return opensearchDomain;
    }
    getUserCreateUrl() {
        return this.cognitoPools ?
            `https://${aws_cdk_lib_1.Stack.of(this).region}.console.aws.amazon.com/cognito/users?region=${aws_cdk_lib_1.Stack.of(this).region}#/pool/${this.cognitoPools.userPool}/users`
            : 'Cognito User Pools are not deployed for existing ES domains';
    }
    getKibanaUrl() {
        const domainEndpoint = process.env.ES_DOMAIN_ENDPOINT ?
            process.env.ES_DOMAIN_ENDPOINT
            : this.opensearchDomain.attrDomainEndpoint;
        return `https://${domainEndpoint}/_dashboards/`;
    }
    configureElasticsearchDomain(opensearchDomain) {
        var _a;
        /*
        * Create our provider Lambda for the custom resource. This Lambda is responsible for configuring
        * our OpenSearch Dashboards instance and updating relevant OpenSearch options (for example, configuring an ingest node)
        */
        const opensearchConfiurationLambda = new lambda.Function(this, 'OpenSearchConfigurationLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            code: lambda.Code.fromAsset('./resources/custom-resources/kibana-config'),
            handler: 'elasticsearchResource.handler',
            timeout: aws_cdk_lib_1.Duration.seconds(100),
            memorySize: 3000,
            environment: {
                Region: aws_cdk_lib_1.Stack.of(this).region,
            },
        });
        const osFullAccessPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceFullAccess');
        (_a = opensearchConfiurationLambda.role) === null || _a === void 0 ? void 0 : _a.addManagedPolicy(osFullAccessPolicy);
        // construct event to be passed to AWS Lambda
        const osPropertyMap = {};
        Object.defineProperties(osPropertyMap, {
            OpenSearchObject: {
                enumerable: true,
                value: opensearchDomain.clusterConfig,
            },
            OpenSearchDomain: {
                enumerable: true,
                value: opensearchDomain.attrDomainEndpoint,
            },
        });
        const provider = new customResources.Provider(this, 'OpenSearch Provider', {
            onEventHandler: opensearchConfiurationLambda,
        });
        const opensearchConfiguration = new aws_cdk_lib_1.CustomResource(this, 'OpenSearchSetup', {
            serviceToken: provider.serviceToken,
            properties: osPropertyMap,
        });
        opensearchConfiguration.node.addDependency(opensearchDomain);
    }
}
exports.ElasticSearchStack = ElasticSearchStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxhc3RpY3NlYXJjaC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVsYXN0aWNzZWFyY2gtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLHFFQUFxRTtBQUNyRSxpQ0FBaUM7OztBQUVqQyw2Q0FBK0U7QUFFL0UsbURBQW1EO0FBQ25ELDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsZ0VBQWdFO0FBQ2hFLGdFQUFnRTtBQWlCaEUsTUFBYSxrQkFBbUIsU0FBUSx5QkFBVztJQVdqRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQThCO1FBQ3RFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsSUFBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQy9DLGlFQUFpRTtZQUNqRSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3pKLENBQUM7YUFBTSxDQUFDO1lBQ04sSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO1lBQzNCLHVDQUF1QztZQUN2QyxNQUFNLE1BQU0sR0FBRyxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXRGLHdEQUF3RDtZQUV4RCxvR0FBb0c7WUFDcEcsSUFBSSxnQkFBZ0IsQ0FBQztZQUVyQiw2QkFBNkI7WUFD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V0FBVyxFQUFFO2dCQUNYLE1BQU0sRUFBRSxtQkFBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNO2FBQzlCO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxrQkFBa0IsR0FBRyxHQUFHLENBQUMsYUFBYSxDQUFDLHdCQUF3QixDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDdkcsTUFBQSw0QkFBNEIsQ0FBQyxJQUFJLDBDQUFFLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFeEUsNkNBQTZDO1FBQzdDLE1BQU0sYUFBYSxHQUFHLEVBQUUsQ0FBQztRQUN6QixNQUFNLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxFQUNuQztZQUNFLGdCQUFnQixFQUFFO2dCQUNoQixVQUFVLEVBQUUsSUFBSTtnQkFDaEIsS0FBSyxFQUFFLGdCQUFnQixDQUFDLGFBQWE7YUFDdEM7WUFDRCxnQkFBZ0IsRUFBRTtnQkFDaEIsVUFBVSxFQUFFLElBQUk7Z0JBQ2hCLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxrQkFBa0I7YUFDM0M7U0FDRixDQUFDLENBQUM7UUFFTCxNQUFNLFFBQVEsR0FBRyxJQUFJLGVBQWUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ3pFLGNBQWMsRUFBRSw0QkFBNEI7U0FDN0MsQ0FBQyxDQUFDO1FBQ0gsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLDRCQUFjLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQzFFLFlBQVksRUFBRSxRQUFRLENBQUMsWUFBWTtZQUNuQyxVQUFVLEVBQUUsYUFBYTtTQUMxQixDQUFDLENBQUM7UUFDSCx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDbkUsQ0FBQztDQUNGO0FBbE9ELGdEQWtPQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCBBbWF6b24uY29tLCBJbmMuIG9yIGl0cyBhZmZpbGlhdGVzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuLy8gU1BEWC1MaWNlbnNlLUlkZW50aWZpZXI6IE1JVC0wXG5cbmltcG9ydCB7IE5lc3RlZFN0YWNrLCBTdGFjaywgRHVyYXRpb24sIEN1c3RvbVJlc291cmNlLCBGbiB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBvcGVuc2VhcmNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1vcGVuc2VhcmNoc2VydmljZSc7XG5pbXBvcnQgKiBhcyBjdXN0b21SZXNvdXJjZXMgZnJvbSAnYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRWxhc3RpY3NlYXJjaFN0YWNrUHJvcHMge1xuICBjY3BVcmw6IHN0cmluZyxcbn1cblxuaW50ZXJmYWNlIENvZ25pdG9Qb29sU3RvcmUge1xuICBpZGVudGl0eVBvb2w6IHN0cmluZyxcbiAgdXNlclBvb2w6IHN0cmluZ1xufVxuXG5pbnRlcmZhY2UgRWxhc3RpY3NlYXJjaFN0YWNrSWFtUmVzb3VyY2VzIHtcbiAgYXV0aFJvbGU6IGlhbS5Sb2xlLFxuICBlc1JvbGU6IGlhbS5Sb2xlLFxuICBlbGFzdGljc2VhcmNoQWNjZXNzUG9saWN5OiBpYW0uUG9saWN5RG9jdW1lbnRcbn1cblxuZXhwb3J0IGNsYXNzIEVsYXN0aWNTZWFyY2hTdGFjayBleHRlbmRzIE5lc3RlZFN0YWNrIHtcbiAgcHJpdmF0ZSBjY3BVcmw6IHN0cmluZztcblxuICBwcml2YXRlIGNjcE5hbWU6IHN0cmluZztcblxuICBwdWJsaWMgZWxhc3RpY3NlYXJjaEFybjogc3RyaW5nO1xuXG4gIHByaXZhdGUgb3BlbnNlYXJjaERvbWFpbjogb3BlbnNlYXJjaC5DZm5Eb21haW47XG5cbiAgcHJpdmF0ZSBjb2duaXRvUG9vbHM6IENvZ25pdG9Qb29sU3RvcmU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVsYXN0aWNzZWFyY2hTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcbiAgICBcbiAgICBpZihwcm9jZXNzLmVudi5FU19ET01BSU5fRU5EUE9JTlQgIT0gdW5kZWZpbmVkKSB7XG4gICAgICAvL2Z1dHVyZSByZWxlYXNlcyBzaG91bGQgaGF2ZSBib3RoIHBhdGhzIHVzZSB0aGUgRG9tYWluIGNvbnN0cnVjdFxuICAgICAgdGhpcy5lbGFzdGljc2VhcmNoQXJuID0gb3BlbnNlYXJjaC5Eb21haW4uZnJvbURvbWFpbkVuZHBvaW50KHRoaXMsIFwiRXhpc3RpbmcgRG9tYWluXCIsIHByb2Nlc3MuZW52LkVTX0RPTUFJTl9FTkRQT0lOVCkuZG9tYWluQXJuLnJlcGxhY2UoJ3NlYXJjaC0nLCAnJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY2NwVXJsID0gcHJvcHMuY2NwVXJsO1xuICAgICAgLy8gZ2V0IGEgdW5pcXVlIHN1ZmZpeCBmcm9tIHRoZSBzdGFja0lkXG4gICAgICBjb25zdCBzdWZmaXggPSBGbi5zZWxlY3QoMywgRm4uc3BsaXQoJy0nLCBGbi5zZWxlY3QoMiwgRm4uc3BsaXQoJy8nLCB0aGlzLnN0YWNrSWQpKSkpO1xuICAgICAgXG4gICAgICAvLyBHZXQgdGhlIG5hbWUgb2YgdGhlIGNvbm5lY3QgaW5zdGFuY2UgZnJvbSB0aGUgY2NwIHVybFxuICAgICAgXG4gICAgICAvLyBQYXJzaW5nIGRlcGVuZHMgb24gc3R5bGUgb2YgQ29ubmVjdCBVUkwgYmVpbmcgdXNlZCAoZGVwZW5kcyBvbiB3aGVuIENvbm5lY3QgcmVzb3VyY2Ugd2FzIGNyZWF0ZWQpXG4gICAgICB2YXIgc3Vic3RyaW5nUGF0dGVybjtcblxuICAgICAgLy8gb2xkLXN0eWxlIFVSTHMgZm9yIENvbm5lY3RcbiAgICAgIGlmICh0aGlzLmNjcFVybC5pbmNsdWRlcygnLmF3c2FwcHMuY29tJykpIHtcbiAgICAgICAgc3Vic3RyaW5nUGF0dGVybiA9ICcuYXdzYXBwcy5jb20nO1xuICAgICAgfSBcbiAgICAgIC8vIG5ldy1zdHlsZSBVUkxzIGZvciBDb25uZWN0XG4gICAgICBlbHNlIGlmICh0aGlzLmNjcFVybC5pbmNsdWRlcygnLm15LmNvbm5lY3QuYXdzJykpIHtcbiAgICAgICAgc3Vic3RyaW5nUGF0dGVybiA9ICcubXkuY29ubmVjdC5hd3MnO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgQ29ubmVjdCBVUkwgZm9ybWF0LCBleHBlY3RlZCBcInh4eC5hd3NhcHBzLmNvbVwiIG9yIFwieHh4Lm15LmNvbm5lY3QuYXdzXCIhJyk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY2NwTmFtZSA9IHRoaXMuY2NwVXJsLnN1YnN0cmluZyhcbiAgICAgICAgdGhpcy5jY3BVcmwuaW5kZXhPZignLy8nKSArIDIsXG4gICAgICAgIHRoaXMuY2NwVXJsLmluZGV4T2Yoc3Vic3RyaW5nUGF0dGVybiksXG4gICAgICApO1xuXG4gICAgICBpZiAodGhpcy5jY3BOYW1lLmxlbmd0aCA+IDI0KSB7XG4gICAgICAgIHRoaXMuY2NwTmFtZSA9IHRoaXMuY2NwTmFtZS5zdWJzdHJpbmcoMCwgMjQpO1xuICAgICAgfVxuICAgICAgdGhpcy5jb2duaXRvUG9vbHMgPSB0aGlzLmNyZWF0ZUNvZ25pdG9Qb29scyhzdWZmaXgpO1xuICAgICAgY29uc3QgaWFtUmVzb3VyY2VzID0gdGhpcy5jcmVhdGVJYW1SZXNvdXJjZXModGhpcy5jb2duaXRvUG9vbHMuaWRlbnRpdHlQb29sKTtcbiAgICAgIHRoaXMub3BlbnNlYXJjaERvbWFpbiA9IHRoaXMuY3JlYXRlRWxhc3RpY3NlYXJjaERvbWFpbihcbiAgICAgICAgdGhpcy5jb2duaXRvUG9vbHMsXG4gICAgICAgIGlhbVJlc291cmNlcyxcbiAgICAgICk7XG4gICAgICB0aGlzLmVsYXN0aWNzZWFyY2hBcm4gPSB0aGlzLm9wZW5zZWFyY2hEb21haW4uYXR0ckFybjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUNvZ25pdG9Qb29scyhzdWZmaXg6IHN0cmluZykge1xuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uQ2ZuVXNlclBvb2wodGhpcywgJ3VzZXJQb29sJywge1xuICAgICAgYWRtaW5DcmVhdGVVc2VyQ29uZmlnOiB7XG4gICAgICAgIGFsbG93QWRtaW5DcmVhdGVVc2VyT25seTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwb2xpY2llczogeyBwYXNzd29yZFBvbGljeTogeyBtaW5pbXVtTGVuZ3RoOiA4IH0gfSxcbiAgICAgIHVzZXJuYW1lQXR0cmlidXRlczogWydlbWFpbCddLFxuICAgICAgYXV0b1ZlcmlmaWVkQXR0cmlidXRlczogWydlbWFpbCddLFxuICAgIH0pO1xuXG4gICAgbmV3IGNvZ25pdG8uQ2ZuVXNlclBvb2xEb21haW4odGhpcywgJ2NvZ25pdG9Eb21haW4nLCB7XG4gICAgICBkb21haW46IGAke3RoaXMuY2NwTmFtZS50b0xvd2VyQ2FzZSgpfS0ke3N1ZmZpeH1gLFxuICAgICAgdXNlclBvb2xJZDogdXNlclBvb2wucmVmLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaWRQb29sID0gbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sKHRoaXMsICdpZGVudGl0eVBvb2wnLCB7XG4gICAgICBhbGxvd1VuYXV0aGVudGljYXRlZElkZW50aXRpZXM6IGZhbHNlLFxuICAgICAgY29nbml0b0lkZW50aXR5UHJvdmlkZXJzOiBbXSxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBpZGVudGl0eVBvb2w6IGlkUG9vbC5yZWYsXG4gICAgICB1c2VyUG9vbDogdXNlclBvb2wucmVmLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUlhbVJlc291cmNlcyhpZGVudGl0eVBvb2w6IHN0cmluZykge1xuICAgIGNvbnN0IGF1dGhSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdhdXRoUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbScsIHtcbiAgICAgICAgU3RyaW5nRXF1YWxzOiB7ICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkJzogaWRlbnRpdHlQb29sIH0sXG4gICAgICAgICdGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlJzogeyAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtcic6ICdhdXRoZW50aWNhdGVkJyB9LFxuICAgICAgfSwgJ3N0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5JyksXG4gICAgfSk7XG5cbiAgICBjb25zdCBlc1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ2VzUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdvcGVuc2VhcmNoLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW2lhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQW1hem9uT3BlblNlYXJjaFNlcnZpY2VDb2duaXRvQWNjZXNzJyldLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGEgdHJ1c3QgcmVsYXRpb25zaGlwIHRvIGFsbG93IE9wZW5TZWFyY2ggdG8gYXNzdW1lIHRoZSByb2xlXG4gICAgZXNSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnc3RzOkFzc3VtZVJvbGUnXSxcbiAgICAgIHJlc291cmNlczogWycqJ11cbiAgICB9KSk7XG5cbiAgICBjb25zdCBwb2xpY3kgPSBuZXcgaWFtLlBvbGljeURvY3VtZW50KCk7XG4gICAgcG9saWN5LmFkZFN0YXRlbWVudHMoXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgcHJpbmNpcGFsczogW1xuICAgICAgICAgIG5ldyBpYW0uQWNjb3VudFByaW5jaXBhbChTdGFjay5vZih0aGlzKS5hY2NvdW50KSxcbiAgICAgICAgICBuZXcgaWFtLkFyblByaW5jaXBhbChhdXRoUm9sZS5yb2xlQXJuKSxcbiAgICAgICAgXSxcbiAgICAgICAgYWN0aW9uczogWydlczoqJ10sXG4gICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmVzOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmRvbWFpbi8qLypgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCh0aGlzLCAndXNlclBvb2xSb2xlQXR0YWNobWVudCcsIHtcbiAgICAgIGlkZW50aXR5UG9vbElkOiBpZGVudGl0eVBvb2wsXG4gICAgICByb2xlczoge1xuICAgICAgICBhdXRoZW50aWNhdGVkOiBhdXRoUm9sZS5yb2xlQXJuLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBhdXRoUm9sZSxcbiAgICAgIGVzUm9sZSxcbiAgICAgIGVsYXN0aWNzZWFyY2hBY2Nlc3NQb2xpY3k6IHBvbGljeSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVFbGFzdGljc2VhcmNoRG9tYWluKFxuICAgIGNvZ25pdG9Qb29sczogQ29nbml0b1Bvb2xTdG9yZSxcbiAgICBpYW1SZXNvdXJjZXM6IEVsYXN0aWNzZWFyY2hTdGFja0lhbVJlc291cmNlcyxcbiAgKSB7XG4gICAgY29uc3Qgb3BlbnNlYXJjaERvbWFpbiA9IG5ldyBvcGVuc2VhcmNoLkNmbkRvbWFpbih0aGlzLCAnT3BlblNlYXJjaERvbWFpbicsIHtcbiAgICAgIGFjY2Vzc1BvbGljaWVzOiBpYW1SZXNvdXJjZXMuZWxhc3RpY3NlYXJjaEFjY2Vzc1BvbGljeSxcbiAgICAgIGVuY3J5cHRpb25BdFJlc3RPcHRpb25zOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgZWJzT3B0aW9uczoge1xuICAgICAgICBlYnNFbmFibGVkOiB0cnVlLFxuICAgICAgICB2b2x1bWVTaXplOiAxMDAsIC8vIFJlZHVjZWQgZnJvbSAxMDAwIGZvciBmYXN0ZXIgZGVwbG95bWVudFxuICAgICAgICB2b2x1bWVUeXBlOiAnZ3AyJyxcbiAgICAgIH0sXG4gICAgICBlbmdpbmVWZXJzaW9uOiAnT3BlblNlYXJjaF8yLjUnLFxuICAgICAgY2x1c3RlckNvbmZpZzoge1xuICAgICAgICBkZWRpY2F0ZWRNYXN0ZXJDb3VudDogMyxcbiAgICAgICAgZGVkaWNhdGVkTWFzdGVyRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgZGVkaWNhdGVkTWFzdGVyVHlwZTogJ2M1LmxhcmdlLnNlYXJjaCcsXG4gICAgICAgIGluc3RhbmNlQ291bnQ6IDIsIC8vIFJlZHVjZWQgZnJvbSAzIGZvciBmYXN0ZXIgZGVwbG95bWVudFxuICAgICAgICBpbnN0YW5jZVR5cGU6ICdyNS5sYXJnZS5zZWFyY2gnLCAvLyBDaGFuZ2VkIGZyb20gcjUuMnhsYXJnZSBmb3IgZmFzdGVyIGRlcGxveW1lbnRcbiAgICAgICAgem9uZUF3YXJlbmVzc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIHpvbmVBd2FyZW5lc3NDb25maWc6IHtcbiAgICAgICAgICBhdmFpbGFiaWxpdHlab25lQ291bnQ6IDIsIC8vIENoYW5nZWQgZnJvbSAzIHRvIG1hdGNoIGluc3RhbmNlQ291bnRcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBkb21haW5FbmRwb2ludE9wdGlvbnM6IHtcbiAgICAgICAgZW5mb3JjZUh0dHBzOiB0cnVlLFxuICAgICAgICB0bHNTZWN1cml0eVBvbGljeTogJ1BvbGljeS1NaW4tVExTLTEtMi0yMDE5LTA3J1xuICAgICAgfSxcbiAgICAgIGNvZ25pdG9PcHRpb25zOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIGlkZW50aXR5UG9vbElkOiBjb2duaXRvUG9vbHMuaWRlbnRpdHlQb29sLFxuICAgICAgICByb2xlQXJuOiBpYW1SZXNvdXJjZXMuZXNSb2xlLnJvbGVBcm4sXG4gICAgICAgIHVzZXJQb29sSWQ6IGNvZ25pdG9Qb29scy51c2VyUG9vbFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5jb25maWd1cmVFbGFzdGljc2VhcmNoRG9tYWluKG9wZW5zZWFyY2hEb21haW4pO1xuICAgIHJldHVybiBvcGVuc2VhcmNoRG9tYWluO1xuICB9XG5cbiAgcHVibGljIGdldFVzZXJDcmVhdGVVcmwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY29nbml0b1Bvb2xzID9cbiAgICAgIGBodHRwczovLyR7U3RhY2sub2YodGhpcykucmVnaW9ufS5jb25zb2xlLmF3cy5hbWF6b24uY29tL2NvZ25pdG8vdXNlcnM/cmVnaW9uPSR7U3RhY2sub2YodGhpcykucmVnaW9ufSMvcG9vbC8ke3RoaXMuY29nbml0b1Bvb2xzLnVzZXJQb29sfS91c2Vyc2BcbiAgICAgIDogJ0NvZ25pdG8gVXNlciBQb29scyBhcmUgbm90IGRlcGxveWVkIGZvciBleGlzdGluZyBFUyBkb21haW5zJztcbiAgfVxuXG4gIHB1YmxpYyBnZXRLaWJhbmFVcmwoKSB7XG4gICAgY29uc3QgZG9tYWluRW5kcG9pbnQgPSBwcm9jZXNzLmVudi5FU19ET01BSU5fRU5EUE9JTlQgPyBcbiAgICAgIHByb2Nlc3MuZW52LkVTX0RPTUFJTl9FTkRQT0lOVFxuICAgICAgOiB0aGlzLm9wZW5zZWFyY2hEb21haW4uYXR0ckRvbWFpbkVuZHBvaW50O1xuICAgIHJldHVybiBgaHR0cHM6Ly8ke2RvbWFpbkVuZHBvaW50fS9fZGFzaGJvYXJkcy9gO1xuICB9XG5cbiAgcHJpdmF0ZSBjb25maWd1cmVFbGFzdGljc2VhcmNoRG9tYWluKG9wZW5zZWFyY2hEb21haW46IG9wZW5zZWFyY2guQ2ZuRG9tYWluKSB7XG4gICAgLypcbiAgICAqIENyZWF0ZSBvdXIgcHJvdmlkZXIgTGFtYmRhIGZvciB0aGUgY3VzdG9tIHJlc291cmNlLiBUaGlzIExhbWJkYSBpcyByZXNwb25zaWJsZSBmb3IgY29uZmlndXJpbmdcbiAgICAqIG91ciBPcGVuU2VhcmNoIERhc2hib2FyZHMgaW5zdGFuY2UgYW5kIHVwZGF0aW5nIHJlbGV2YW50IE9wZW5TZWFyY2ggb3B0aW9ucyAoZm9yIGV4YW1wbGUsIGNvbmZpZ3VyaW5nIGFuIGluZ2VzdCBub2RlKVxuICAgICovXG4gICAgY29uc3Qgb3BlbnNlYXJjaENvbmZpdXJhdGlvbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ09wZW5TZWFyY2hDb25maWd1cmF0aW9uTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4vcmVzb3VyY2VzL2N1c3RvbS1yZXNvdXJjZXMva2liYW5hLWNvbmZpZycpLFxuICAgICAgaGFuZGxlcjogJ2VsYXN0aWNzZWFyY2hSZXNvdXJjZS5oYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIG1lbW9yeVNpemU6IDMwMDAsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSZWdpb246IFN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgY29uc3Qgb3NGdWxsQWNjZXNzUG9saWN5ID0gaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25PcGVuU2VhcmNoU2VydmljZUZ1bGxBY2Nlc3MnKTtcbiAgICAgICAgb3BlbnNlYXJjaENvbmZpdXJhdGlvbkxhbWJkYS5yb2xlPy5hZGRNYW5hZ2VkUG9saWN5KG9zRnVsbEFjY2Vzc1BvbGljeSk7XG5cbiAgICAgICAgLy8gY29uc3RydWN0IGV2ZW50IHRvIGJlIHBhc3NlZCB0byBBV1MgTGFtYmRhXG4gICAgICAgIGNvbnN0IG9zUHJvcGVydHlNYXAgPSB7fTtcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMob3NQcm9wZXJ0eU1hcCxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBPcGVuU2VhcmNoT2JqZWN0OiB7XG4gICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgIHZhbHVlOiBvcGVuc2VhcmNoRG9tYWluLmNsdXN0ZXJDb25maWcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgT3BlblNlYXJjaERvbWFpbjoge1xuICAgICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICB2YWx1ZTogb3BlbnNlYXJjaERvbWFpbi5hdHRyRG9tYWluRW5kcG9pbnQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gbmV3IGN1c3RvbVJlc291cmNlcy5Qcm92aWRlcih0aGlzLCAnT3BlblNlYXJjaCBQcm92aWRlcicsIHtcbiAgICAgICAgICBvbkV2ZW50SGFuZGxlcjogb3BlbnNlYXJjaENvbmZpdXJhdGlvbkxhbWJkYSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IG9wZW5zZWFyY2hDb25maWd1cmF0aW9uID0gbmV3IEN1c3RvbVJlc291cmNlKHRoaXMsICdPcGVuU2VhcmNoU2V0dXAnLCB7XG4gICAgICAgICAgc2VydmljZVRva2VuOiBwcm92aWRlci5zZXJ2aWNlVG9rZW4sXG4gICAgICAgICAgcHJvcGVydGllczogb3NQcm9wZXJ0eU1hcCxcbiAgICAgICAgfSk7XG4gICAgICAgIG9wZW5zZWFyY2hDb25maWd1cmF0aW9uLm5vZGUuYWRkRGVwZW5kZW5jeShvcGVuc2VhcmNoRG9tYWluKTtcbiAgfVxufVxuIl19