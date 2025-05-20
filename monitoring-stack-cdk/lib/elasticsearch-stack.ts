// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { NestedStack, Stack, Duration, CustomResource, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as customResources from 'aws-cdk-lib/custom-resources';

export interface ElasticsearchStackProps {
  ccpUrl: string,
}

interface CognitoPoolStore {
  identityPool: string,
  userPool: string
}

interface ElasticsearchStackIamResources {
  authRole: iam.Role,
  esRole: iam.Role,
  elasticsearchAccessPolicy: iam.PolicyDocument
}

export class ElasticSearchStack extends NestedStack {
  private ccpUrl: string;

  private ccpName: string;

  public elasticsearchArn: string;

  private opensearchDomain: opensearch.CfnDomain;

  private cognitoPools: CognitoPoolStore;

  constructor(scope: Construct, id: string, props: ElasticsearchStackProps) {
    super(scope, id);
    
    if(process.env.ES_DOMAIN_ENDPOINT != undefined) {
      //future releases should have both paths use the Domain construct
      this.elasticsearchArn = opensearch.Domain.fromDomainEndpoint(this, "Existing Domain", process.env.ES_DOMAIN_ENDPOINT).domainArn.replace('search-', '');
    } else {
      this.ccpUrl = props.ccpUrl;
      // get a unique suffix from the stackId
      const suffix = Fn.select(3, Fn.split('-', Fn.select(2, Fn.split('/', this.stackId))));
      
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

      this.ccpName = this.ccpUrl.substring(
        this.ccpUrl.indexOf('//') + 2,
        this.ccpUrl.indexOf(substringPattern),
      );

      if (this.ccpName.length > 24) {
        this.ccpName = this.ccpName.substring(0, 24);
      }
      this.cognitoPools = this.createCognitoPools(suffix);
      const iamResources = this.createIamResources(this.cognitoPools.identityPool);
      this.opensearchDomain = this.createElasticsearchDomain(
        this.cognitoPools,
        iamResources,
      );
      this.elasticsearchArn = this.opensearchDomain.attrArn;
    }
  }

  private createCognitoPools(suffix: string) {
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

  private createIamResources(identityPool: string) {
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
    policy.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.AccountPrincipal(Stack.of(this).account),
          new iam.ArnPrincipal(authRole.roleArn),
          new iam.ServicePrincipal('opensearchservice.amazonaws.com')
        ],
        actions: ['es:*'],
        resources: [`arn:aws:es:${Stack.of(this).region}:${Stack.of(this).account}:domain/*/*`],
      }),
    );

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

  private createElasticsearchDomain(
    cognitoPools: CognitoPoolStore,
    iamResources: ElasticsearchStackIamResources,
  ) {
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

  public getUserCreateUrl() {
    return this.cognitoPools ?
      `https://${Stack.of(this).region}.console.aws.amazon.com/cognito/users?region=${Stack.of(this).region}#/pool/${this.cognitoPools.userPool}/users`
      : 'Cognito User Pools are not deployed for existing ES domains';
  }

  public getKibanaUrl() {
    const domainEndpoint = process.env.ES_DOMAIN_ENDPOINT ? 
      process.env.ES_DOMAIN_ENDPOINT
      : this.opensearchDomain.attrDomainEndpoint;
    return `https://${domainEndpoint}/_dashboards/`;
  }

  private configureElasticsearchDomain(opensearchDomain: opensearch.CfnDomain) {
    /*
    * Create our provider Lambda for the custom resource. This Lambda is responsible for configuring
    * our OpenSearch Dashboards instance and updating relevant OpenSearch options (for example, configuring an ingest node)
    */
    const opensearchConfiurationLambda = new lambda.Function(this, 'OpenSearchConfigurationLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('./resources/custom-resources/kibana-config'),
      handler: 'elasticsearchResource.handler',
      timeout: Duration.seconds(100),
      memorySize: 3000,
      environment: {
        Region: Stack.of(this).region,
      },
    });
    const osFullAccessPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonOpenSearchServiceFullAccess');
        opensearchConfiurationLambda.role?.addManagedPolicy(osFullAccessPolicy);

        // construct event to be passed to AWS Lambda
        const osPropertyMap = {};
        Object.defineProperties(osPropertyMap,
          {
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
        const opensearchConfiguration = new CustomResource(this, 'OpenSearchSetup', {
          serviceToken: provider.serviceToken,
          properties: osPropertyMap,
        });
        opensearchConfiguration.node.addDependency(opensearchDomain);
  }
}
