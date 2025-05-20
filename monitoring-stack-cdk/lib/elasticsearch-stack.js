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
        // Create a role that can be assumed by the OpenSearch service
        const esRole = new iam.Role(this, 'esRole', {
            assumedBy: new iam.ServicePrincipal('opensearchservice.amazonaws.com'),
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceCognitoAccess')],
        });
        // Add a trust relationship to allow OpenSearch Service to assume the role
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
                new iam.ServicePrincipal('opensearchservice.amazonaws.com')
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxhc3RpY3NlYXJjaC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVsYXN0aWNzZWFyY2gtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLHFFQUFxRTtBQUNyRSxpQ0FBaUM7OztBQUVqQyw2Q0FBK0U7QUFFL0UsbURBQW1EO0FBQ25ELDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsZ0VBQWdFO0FBQ2hFLGdFQUFnRTtBQWlCaEUsTUFBYSxrQkFBbUIsU0FBUSx5QkFBVztJQVdqRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQThCO1FBQ3RFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsSUFBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQy9DLGlFQUFpRTtZQUNqRSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3pKLENBQUM7YUFBTSxDQUFDO1lBQ04sSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO1lBQzNCLHVDQUF1QztZQUN2QyxNQUFNLE1BQU0sR0FBRyxnQkFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsZ0JBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLGdCQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxnQkFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXRGLHdEQUF3RDtZQUV4RCxvR0FBb0c7WUFDcEcsSUFBSSxnQkFBZ0IsQ0FBQztZQUVyQiw2QkFBNkI7WUFD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IEluYy4gb3IgaXRzIGFmZmlsaWF0ZXMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4vLyBTUERYLUxpY2Vuc2UtSWRlbnRpZmllcjogTUlULTBcblxuaW1wb3J0IHsgTmVzdGVkU3RhY2ssIFN0YWNrLCBEdXJhdGlvbiwgQ3VzdG9tUmVzb3VyY2UsIEZuIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIG9wZW5zZWFyY2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLW9wZW5zZWFyY2hzZXJ2aWNlJztcbmltcG9ydCAqIGFzIGN1c3RvbVJlc291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9jdXN0b20tcmVzb3VyY2VzJztcblxuZXhwb3J0IGludGVyZmFjZSBFbGFzdGljc2VhcmNoU3RhY2tQcm9wcyB7XG4gIGNjcFVybDogc3RyaW5nLFxufVxuXG5pbnRlcmZhY2UgQ29nbml0b1Bvb2xTdG9yZSB7XG4gIGlkZW50aXR5UG9vbDogc3RyaW5nLFxuICB1c2VyUG9vbDogc3RyaW5nXG59XG5cbmludGVyZmFjZSBFbGFzdGljc2VhcmNoU3RhY2tJYW1SZXNvdXJjZXMge1xuICBhdXRoUm9sZTogaWFtLlJvbGUsXG4gIGVzUm9sZTogaWFtLlJvbGUsXG4gIGVsYXN0aWNzZWFyY2hBY2Nlc3NQb2xpY3k6IGlhbS5Qb2xpY3lEb2N1bWVudFxufVxuXG5leHBvcnQgY2xhc3MgRWxhc3RpY1NlYXJjaFN0YWNrIGV4dGVuZHMgTmVzdGVkU3RhY2sge1xuICBwcml2YXRlIGNjcFVybDogc3RyaW5nO1xuXG4gIHByaXZhdGUgY2NwTmFtZTogc3RyaW5nO1xuXG4gIHB1YmxpYyBlbGFzdGljc2VhcmNoQXJuOiBzdHJpbmc7XG5cbiAgcHJpdmF0ZSBvcGVuc2VhcmNoRG9tYWluOiBvcGVuc2VhcmNoLkNmbkRvbWFpbjtcblxuICBwcml2YXRlIGNvZ25pdG9Qb29sczogQ29nbml0b1Bvb2xTdG9yZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRWxhc3RpY3NlYXJjaFN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIFxuICAgIGlmKHByb2Nlc3MuZW52LkVTX0RPTUFJTl9FTkRQT0lOVCAhPSB1bmRlZmluZWQpIHtcbiAgICAgIC8vZnV0dXJlIHJlbGVhc2VzIHNob3VsZCBoYXZlIGJvdGggcGF0aHMgdXNlIHRoZSBEb21haW4gY29uc3RydWN0XG4gICAgICB0aGlzLmVsYXN0aWNzZWFyY2hBcm4gPSBvcGVuc2VhcmNoLkRvbWFpbi5mcm9tRG9tYWluRW5kcG9pbnQodGhpcywgXCJFeGlzdGluZyBEb21haW5cIiwgcHJvY2Vzcy5lbnYuRVNfRE9NQUlOX0VORFBPSU5UKS5kb21haW5Bcm4ucmVwbGFjZSgnc2VhcmNoLScsICcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5jY3BVcmwgPSBwcm9wcy5jY3BVcmw7XG4gICAgICAvLyBnZXQgYSB1bmlxdWUgc3VmZml4IGZyb20gdGhlIHN0YWNrSWRcbiAgICAgIGNvbnN0IHN1ZmZpeCA9IEZuLnNlbGVjdCgzLCBGbi5zcGxpdCgnLScsIEZuLnNlbGVjdCgyLCBGbi5zcGxpdCgnLycsIHRoaXMuc3RhY2tJZCkpKSk7XG4gICAgICBcbiAgICAgIC8vIEdldCB0aGUgbmFtZSBvZiB0aGUgY29ubmVjdCBpbnN0YW5jZSBmcm9tIHRoZSBjY3AgdXJsXG4gICAgICBcbiAgICAgIC8vIFBhcnNpbmcgZGVwZW5kcyBvbiBzdHlsZSBvZiBDb25uZWN0IFVSTCBiZWluZyB1c2VkIChkZXBlbmRzIG9uIHdoZW4gQ29ubmVjdCByZXNvdXJjZSB3YXMgY3JlYXRlZClcbiAgICAgIHZhciBzdWJzdHJpbmdQYXR0ZXJuO1xuXG4gICAgICAvLyBvbGQtc3R5bGUgVVJMcyBmb3IgQ29ubmVjdFxuICAgICAgaWYgKHRoaXMuY2NwVXJsLmluY2x1ZGVzKCcuYXdzYXBwcy5jb20nKSkge1xuICAgICAgICBzdWJzdHJpbmdQYXR0ZXJuID0gJy5hd3NhcHBzLmNvbSc7XG4gICAgICB9IFxuICAgICAgLy8gbmV3LXN0eWxlIFVSTHMgZm9yIENvbm5lY3RcbiAgICAgIGVsc2UgaWYgKHRoaXMuY2NwVXJsLmluY2x1ZGVzKCcubXkuY29ubmVjdC5hd3MnKSkge1xuICAgICAgICBzdWJzdHJpbmdQYXR0ZXJuID0gJy5teS5jb25uZWN0LmF3cyc7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBDb25uZWN0IFVSTCBmb3JtYXQsIGV4cGVjdGVkIFwieHh4LmF3c2FwcHMuY29tXCIgb3IgXCJ4eHgubXkuY29ubmVjdC5hd3NcIiEnKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5jY3BOYW1lID0gdGhpcy5jY3BVcmwuc3Vic3RyaW5nKFxuICAgICAgICB0aGlzLmNjcFVybC5pbmRleE9mKCcvLycpICsgMixcbiAgICAgICAgdGhpcy5jY3BVcmwuaW5kZXhPZihzdWJzdHJpbmdQYXR0ZXJuKSxcbiAgICAgICk7XG5cbiAgICAgIGlmICh0aGlzLmNjcE5hbWUubGVuZ3RoID4gMjQpIHtcbiAgICAgICAgdGhpcy5jY3BOYW1lID0gdGhpcy5jY3BOYW1lLnN1YnN0cmluZygwLCAyNCk7XG4gICAgICB9XG4gICAgICB0aGlzLmNvZ25pdG9Qb29scyA9IHRoaXMuY3JlYXRlQ29nbml0b1Bvb2xzKHN1ZmZpeCk7XG4gICAgICBjb25zdCBpYW1SZXNvdXJjZXMgPSB0aGlzLmNyZWF0ZUlhbVJlc291cmNlcyh0aGlzLmNvZ25pdG9Qb29scy5pZGVudGl0eVBvb2wpO1xuICAgICAgdGhpcy5vcGVuc2VhcmNoRG9tYWluID0gdGhpcy5jcmVhdGVFbGFzdGljc2VhcmNoRG9tYWluKFxuICAgICAgICB0aGlzLmNvZ25pdG9Qb29scyxcbiAgICAgICAgaWFtUmVzb3VyY2VzLFxuICAgICAgKTtcbiAgICAgIHRoaXMuZWxhc3RpY3NlYXJjaEFybiA9IHRoaXMub3BlbnNlYXJjaERvbWFpbi5hdHRyQXJuO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQ29nbml0b1Bvb2xzKHN1ZmZpeDogc3RyaW5nKSB7XG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5DZm5Vc2VyUG9vbCh0aGlzLCAndXNlclBvb2wnLCB7XG4gICAgICBhZG1pbkNyZWF0ZVVzZXJDb25maWc6IHtcbiAgICAgICAgYWxsb3dBZG1pbkNyZWF0ZVVzZXJPbmx5OiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHBvbGljaWVzOiB7IHBhc3N3b3JkUG9saWN5OiB7IG1pbmltdW1MZW5ndGg6IDggfSB9LFxuICAgICAgdXNlcm5hbWVBdHRyaWJ1dGVzOiBbJ2VtYWlsJ10sXG4gICAgICBhdXRvVmVyaWZpZWRBdHRyaWJ1dGVzOiBbJ2VtYWlsJ10sXG4gICAgfSk7XG5cbiAgICBuZXcgY29nbml0by5DZm5Vc2VyUG9vbERvbWFpbih0aGlzLCAnY29nbml0b0RvbWFpbicsIHtcbiAgICAgIGRvbWFpbjogYCR7dGhpcy5jY3BOYW1lLnRvTG93ZXJDYXNlKCl9LSR7c3VmZml4fWAsXG4gICAgICB1c2VyUG9vbElkOiB1c2VyUG9vbC5yZWYsXG4gICAgfSk7XG5cbiAgICBjb25zdCBpZFBvb2wgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2wodGhpcywgJ2lkZW50aXR5UG9vbCcsIHtcbiAgICAgIGFsbG93VW5hdXRoZW50aWNhdGVkSWRlbnRpdGllczogZmFsc2UsXG4gICAgICBjb2duaXRvSWRlbnRpdHlQcm92aWRlcnM6IFtdLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlkZW50aXR5UG9vbDogaWRQb29sLnJlZixcbiAgICAgIHVzZXJQb29sOiB1c2VyUG9vbC5yZWYsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlSWFtUmVzb3VyY2VzKGlkZW50aXR5UG9vbDogc3RyaW5nKSB7XG4gICAgY29uc3QgYXV0aFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ2F1dGhSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbCgnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tJywge1xuICAgICAgICBTdHJpbmdFcXVhbHM6IHsgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWQnOiBpZGVudGl0eVBvb2wgfSxcbiAgICAgICAgJ0ZvckFueVZhbHVlOlN0cmluZ0xpa2UnOiB7ICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yJzogJ2F1dGhlbnRpY2F0ZWQnIH0sXG4gICAgICB9LCAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhIHJvbGUgdGhhdCBjYW4gYmUgYXNzdW1lZCBieSB0aGUgT3BlblNlYXJjaCBzZXJ2aWNlXG4gICAgY29uc3QgZXNSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdlc1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnb3BlbnNlYXJjaHNlcnZpY2UuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25PcGVuU2VhcmNoU2VydmljZUNvZ25pdG9BY2Nlc3MnKV0sXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYSB0cnVzdCByZWxhdGlvbnNoaXAgdG8gYWxsb3cgT3BlblNlYXJjaCBTZXJ2aWNlIHRvIGFzc3VtZSB0aGUgcm9sZVxuICAgIGVzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJ3N0czpBc3N1bWVSb2xlJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddXG4gICAgfSkpO1xuXG4gICAgY29uc3QgcG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCgpO1xuICAgIHBvbGljeS5hZGRTdGF0ZW1lbnRzKFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIHByaW5jaXBhbHM6IFtcbiAgICAgICAgICBuZXcgaWFtLkFjY291bnRQcmluY2lwYWwoU3RhY2sub2YodGhpcykuYWNjb3VudCksXG4gICAgICAgICAgbmV3IGlhbS5Bcm5QcmluY2lwYWwoYXV0aFJvbGUucm9sZUFybiksXG4gICAgICAgICAgbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdvcGVuc2VhcmNoc2VydmljZS5hbWF6b25hd3MuY29tJylcbiAgICAgICAgXSxcbiAgICAgICAgYWN0aW9uczogWydlczoqJ10sXG4gICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmVzOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmRvbWFpbi8qLypgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCh0aGlzLCAndXNlclBvb2xSb2xlQXR0YWNobWVudCcsIHtcbiAgICAgIGlkZW50aXR5UG9vbElkOiBpZGVudGl0eVBvb2wsXG4gICAgICByb2xlczoge1xuICAgICAgICBhdXRoZW50aWNhdGVkOiBhdXRoUm9sZS5yb2xlQXJuLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBhdXRoUm9sZSxcbiAgICAgIGVzUm9sZSxcbiAgICAgIGVsYXN0aWNzZWFyY2hBY2Nlc3NQb2xpY3k6IHBvbGljeSxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVFbGFzdGljc2VhcmNoRG9tYWluKFxuICAgIGNvZ25pdG9Qb29sczogQ29nbml0b1Bvb2xTdG9yZSxcbiAgICBpYW1SZXNvdXJjZXM6IEVsYXN0aWNzZWFyY2hTdGFja0lhbVJlc291cmNlcyxcbiAgKSB7XG4gICAgY29uc3Qgb3BlbnNlYXJjaERvbWFpbiA9IG5ldyBvcGVuc2VhcmNoLkNmbkRvbWFpbih0aGlzLCAnT3BlblNlYXJjaERvbWFpbicsIHtcbiAgICAgIGFjY2Vzc1BvbGljaWVzOiBpYW1SZXNvdXJjZXMuZWxhc3RpY3NlYXJjaEFjY2Vzc1BvbGljeSxcbiAgICAgIGVuY3J5cHRpb25BdFJlc3RPcHRpb25zOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgZWJzT3B0aW9uczoge1xuICAgICAgICBlYnNFbmFibGVkOiB0cnVlLFxuICAgICAgICB2b2x1bWVTaXplOiAxMDAsIC8vIFJlZHVjZWQgZnJvbSAxMDAwIGZvciBmYXN0ZXIgZGVwbG95bWVudFxuICAgICAgICB2b2x1bWVUeXBlOiAnZ3AyJyxcbiAgICAgIH0sXG4gICAgICBlbmdpbmVWZXJzaW9uOiAnT3BlblNlYXJjaF8yLjUnLFxuICAgICAgY2x1c3RlckNvbmZpZzoge1xuICAgICAgICBkZWRpY2F0ZWRNYXN0ZXJDb3VudDogMyxcbiAgICAgICAgZGVkaWNhdGVkTWFzdGVyRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgZGVkaWNhdGVkTWFzdGVyVHlwZTogJ2M1LmxhcmdlLnNlYXJjaCcsXG4gICAgICAgIGluc3RhbmNlQ291bnQ6IDIsIC8vIFJlZHVjZWQgZnJvbSAzIGZvciBmYXN0ZXIgZGVwbG95bWVudFxuICAgICAgICBpbnN0YW5jZVR5cGU6ICdyNS5sYXJnZS5zZWFyY2gnLCAvLyBDaGFuZ2VkIGZyb20gcjUuMnhsYXJnZSBmb3IgZmFzdGVyIGRlcGxveW1lbnRcbiAgICAgICAgem9uZUF3YXJlbmVzc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIHpvbmVBd2FyZW5lc3NDb25maWc6IHtcbiAgICAgICAgICBhdmFpbGFiaWxpdHlab25lQ291bnQ6IDIsIC8vIENoYW5nZWQgZnJvbSAzIHRvIG1hdGNoIGluc3RhbmNlQ291bnRcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBkb21haW5FbmRwb2ludE9wdGlvbnM6IHtcbiAgICAgICAgZW5mb3JjZUh0dHBzOiB0cnVlLFxuICAgICAgICB0bHNTZWN1cml0eVBvbGljeTogJ1BvbGljeS1NaW4tVExTLTEtMi0yMDE5LTA3J1xuICAgICAgfSxcbiAgICAgIGNvZ25pdG9PcHRpb25zOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIGlkZW50aXR5UG9vbElkOiBjb2duaXRvUG9vbHMuaWRlbnRpdHlQb29sLFxuICAgICAgICByb2xlQXJuOiBpYW1SZXNvdXJjZXMuZXNSb2xlLnJvbGVBcm4sXG4gICAgICAgIHVzZXJQb29sSWQ6IGNvZ25pdG9Qb29scy51c2VyUG9vbFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5jb25maWd1cmVFbGFzdGljc2VhcmNoRG9tYWluKG9wZW5zZWFyY2hEb21haW4pO1xuICAgIHJldHVybiBvcGVuc2VhcmNoRG9tYWluO1xuICB9XG5cbiAgcHVibGljIGdldFVzZXJDcmVhdGVVcmwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY29nbml0b1Bvb2xzID9cbiAgICAgIGBodHRwczovLyR7U3RhY2sub2YodGhpcykucmVnaW9ufS5jb25zb2xlLmF3cy5hbWF6b24uY29tL2NvZ25pdG8vdXNlcnM/cmVnaW9uPSR7U3RhY2sub2YodGhpcykucmVnaW9ufSMvcG9vbC8ke3RoaXMuY29nbml0b1Bvb2xzLnVzZXJQb29sfS91c2Vyc2BcbiAgICAgIDogJ0NvZ25pdG8gVXNlciBQb29scyBhcmUgbm90IGRlcGxveWVkIGZvciBleGlzdGluZyBFUyBkb21haW5zJztcbiAgfVxuXG4gIHB1YmxpYyBnZXRLaWJhbmFVcmwoKSB7XG4gICAgY29uc3QgZG9tYWluRW5kcG9pbnQgPSBwcm9jZXNzLmVudi5FU19ET01BSU5fRU5EUE9JTlQgPyBcbiAgICAgIHByb2Nlc3MuZW52LkVTX0RPTUFJTl9FTkRQT0lOVFxuICAgICAgOiB0aGlzLm9wZW5zZWFyY2hEb21haW4uYXR0ckRvbWFpbkVuZHBvaW50O1xuICAgIHJldHVybiBgaHR0cHM6Ly8ke2RvbWFpbkVuZHBvaW50fS9fZGFzaGJvYXJkcy9gO1xuICB9XG5cbiAgcHJpdmF0ZSBjb25maWd1cmVFbGFzdGljc2VhcmNoRG9tYWluKG9wZW5zZWFyY2hEb21haW46IG9wZW5zZWFyY2guQ2ZuRG9tYWluKSB7XG4gICAgLypcbiAgICAqIENyZWF0ZSBvdXIgcHJvdmlkZXIgTGFtYmRhIGZvciB0aGUgY3VzdG9tIHJlc291cmNlLiBUaGlzIExhbWJkYSBpcyByZXNwb25zaWJsZSBmb3IgY29uZmlndXJpbmdcbiAgICAqIG91ciBPcGVuU2VhcmNoIERhc2hib2FyZHMgaW5zdGFuY2UgYW5kIHVwZGF0aW5nIHJlbGV2YW50IE9wZW5TZWFyY2ggb3B0aW9ucyAoZm9yIGV4YW1wbGUsIGNvbmZpZ3VyaW5nIGFuIGluZ2VzdCBub2RlKVxuICAgICovXG4gICAgY29uc3Qgb3BlbnNlYXJjaENvbmZpdXJhdGlvbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ09wZW5TZWFyY2hDb25maWd1cmF0aW9uTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4vcmVzb3VyY2VzL2N1c3RvbS1yZXNvdXJjZXMva2liYW5hLWNvbmZpZycpLFxuICAgICAgaGFuZGxlcjogJ2VsYXN0aWNzZWFyY2hSZXNvdXJjZS5oYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMTAwKSxcbiAgICAgIG1lbW9yeVNpemU6IDMwMDAsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBSZWdpb246IFN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgY29uc3Qgb3NGdWxsQWNjZXNzUG9saWN5ID0gaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25PcGVuU2VhcmNoU2VydmljZUZ1bGxBY2Nlc3MnKTtcbiAgICAgICAgb3BlbnNlYXJjaENvbmZpdXJhdGlvbkxhbWJkYS5yb2xlPy5hZGRNYW5hZ2VkUG9saWN5KG9zRnVsbEFjY2Vzc1BvbGljeSk7XG5cbiAgICAgICAgLy8gY29uc3RydWN0IGV2ZW50IHRvIGJlIHBhc3NlZCB0byBBV1MgTGFtYmRhXG4gICAgICAgIGNvbnN0IG9zUHJvcGVydHlNYXAgPSB7fTtcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMob3NQcm9wZXJ0eU1hcCxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBPcGVuU2VhcmNoT2JqZWN0OiB7XG4gICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgIHZhbHVlOiBvcGVuc2VhcmNoRG9tYWluLmNsdXN0ZXJDb25maWcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgT3BlblNlYXJjaERvbWFpbjoge1xuICAgICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICB2YWx1ZTogb3BlbnNlYXJjaERvbWFpbi5hdHRyRG9tYWluRW5kcG9pbnQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHByb3ZpZGVyID0gbmV3IGN1c3RvbVJlc291cmNlcy5Qcm92aWRlcih0aGlzLCAnT3BlblNlYXJjaCBQcm92aWRlcicsIHtcbiAgICAgICAgICBvbkV2ZW50SGFuZGxlcjogb3BlbnNlYXJjaENvbmZpdXJhdGlvbkxhbWJkYSxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IG9wZW5zZWFyY2hDb25maWd1cmF0aW9uID0gbmV3IEN1c3RvbVJlc291cmNlKHRoaXMsICdPcGVuU2VhcmNoU2V0dXAnLCB7XG4gICAgICAgICAgc2VydmljZVRva2VuOiBwcm92aWRlci5zZXJ2aWNlVG9rZW4sXG4gICAgICAgICAgcHJvcGVydGllczogb3NQcm9wZXJ0eU1hcCxcbiAgICAgICAgfSk7XG4gICAgICAgIG9wZW5zZWFyY2hDb25maWd1cmF0aW9uLm5vZGUuYWRkRGVwZW5kZW5jeShvcGVuc2VhcmNoRG9tYWluKTtcbiAgfVxufVxuIl19