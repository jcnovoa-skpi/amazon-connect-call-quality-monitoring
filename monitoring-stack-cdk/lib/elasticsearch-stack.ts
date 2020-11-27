// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cfn from '@aws-cdk/aws-cloudformation';
import * as cdk from '@aws-cdk/core';
import * as cognito from '@aws-cdk/aws-cognito';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as elasticsearch from '@aws-cdk/aws-elasticsearch';
import * as customResources from '@aws-cdk/custom-resources';

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

export class ElasticSearchStack extends cfn.NestedStack {
  private ccpUrl: string;

  private ccpName: string;

  public elasticsearchDomain: elasticsearch.CfnDomain;

  private cognitoPools: CognitoPoolStore;

  constructor(scope: cdk.Construct, id: string, props: ElasticsearchStackProps) {
    super(scope, id);
    this.ccpUrl = props.ccpUrl;
    // get a unique suffix from the second to last element of the stackId, e.g. 9e3a
    const suffix = cdk.Fn.select(3, cdk.Fn.split('-', cdk.Fn.select(2, cdk.Fn.split('/', this.stackId))));
    // get the name of the connect instance from the ccp url
    this.ccpName = this.ccpUrl.substring(
      this.ccpUrl.indexOf('//') + 2,
      this.ccpUrl.indexOf('.awsapps.com'),
    );

    // es max domain name length is 28. suffix is 4 characters.
    if (this.ccpName.length > 24) {
      this.ccpName = this.ccpName.substring(0, 24);
    }
    this.cognitoPools = this.createCognitoPools(suffix);
    const iamResources = this.createIamResources(this.cognitoPools.identityPool);
    this.elasticsearchDomain = this.createElasticsearchDomain(
      this.cognitoPools,
      iamResources,
    );
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

    const esRole = new iam.Role(this, 'esRole', {
      assumedBy: new iam.ServicePrincipal('es.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonESCognitoAccess')],
    });

    const policy = new iam.PolicyDocument();
    policy.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [
          new iam.AccountPrincipal(cdk.Stack.of(this).account),
          new iam.ArnPrincipal(authRole.roleArn),
        ],
        actions: ['es:*'],
        resources: [`arn:aws:es:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:domain/*/*`],
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
    const elasticsearchDomain = new elasticsearch.CfnDomain(this, 'ElasticsearchDomain', {
      accessPolicies: iamResources.elasticsearchAccessPolicy,
      encryptionAtRestOptions: {
        enabled: true,
      },
      ebsOptions: {
        ebsEnabled: true,
        volumeSize: 100,
        volumeType: 'gp2',
      },
      elasticsearchClusterConfig: {
        dedicatedMasterCount: 3,
        dedicatedMasterEnabled: true,
        dedicatedMasterType: 'c5.large.elasticsearch',
        instanceCount: 3,
        instanceType: 'r5.large.elasticsearch',
        zoneAwarenessEnabled: true,
        zoneAwarenessConfig: {
          availabilityZoneCount: 3,
        },
      },
      elasticsearchVersion: '7.9',
    });

    elasticsearchDomain.addPropertyOverride('CognitoOptions.Enabled', true);
    elasticsearchDomain.addPropertyOverride('CognitoOptions.IdentityPoolId', cognitoPools.identityPool);
    elasticsearchDomain.addPropertyOverride('CognitoOptions.RoleArn', iamResources.esRole.roleArn);
    elasticsearchDomain.addPropertyOverride('CognitoOptions.UserPoolId', cognitoPools.userPool);

    this.configureElasticsearchDomain(elasticsearchDomain);
    return elasticsearchDomain;
  }

  public getUserCreateUrl() {
    return `https://${this.region}.console.aws.amazon.com/cognito/users?region=${this.region}#/pool/${this.cognitoPools.userPool}/users`;
  }

  public getKibanaUrl() {
    return `https://${this.elasticsearchDomain.attrDomainEndpoint}/_plugin/kibana/`;
  }

  private configureElasticsearchDomain(elasticsearchDomain: elasticsearch.CfnDomain) {
    /*
    * Create our provider Lambda for the custom resource. This Lambda is responsible for configuring
    * our Kibana instance and updating relevant ES options (for example, configuring an ingest node)
    */
    const elasticsearchConfiurationLambda = new lambda.Function(this, 'ElasticsearchConfigurationLambda', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset('./resources/custom-resources/kibana-config'),
      handler: 'kibanaConfigurer.handler',
      timeout: cdk.Duration.seconds(100),
      memorySize: 3000,
      environment: {
        Region: cdk.Stack.of(this).region,
      },
    });
    const esFullAccessPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonESFullAccess');
        elasticsearchConfiurationLambda.role?.addManagedPolicy(esFullAccessPolicy);

        // construct event to be passed to AWS Lambda
        const esPropertyMap = {};
        Object.defineProperties(esPropertyMap,
          {
            ElasticsearchObject: {
              enumerable: true,
              value: elasticsearchDomain.elasticsearchClusterConfig,
            },
            ElasticsearchDomain: {
              enumerable: true,
              value: elasticsearchDomain.attrDomainEndpoint,
            },
          });

        const provider = new customResources.Provider(this, 'Elasticsearch Provider', {
          onEventHandler: elasticsearchConfiurationLambda,
        });
        const elasticsearchConfiguration = new cdk.CustomResource(this, 'ElasticsearchSetup', {
          serviceToken: provider.serviceToken,
          properties: esPropertyMap,
        });
        elasticsearchConfiguration.node.addDependency(elasticsearchDomain);
  }
}
