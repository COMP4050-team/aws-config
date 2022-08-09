import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

// Create an AWS resource (S3 Bucket)
const bucket = new aws.s3.Bucket('uploads');

const bucketCORSConfig = new aws.s3.BucketCorsConfigurationV2('cors', {
  bucket: bucket.id,
  corsRules: [
    {
      allowedHeaders: ['*'],
      allowedMethods: ['HEAD', 'GET', 'PUT', 'POST', 'DELETE'],
      allowedOrigins: ['*'],
      exposeHeaders: ['ETag'],
    },
  ],
});

const bucketPolicy = new aws.s3.BucketPolicy('policy', {
  bucket: bucket.id,
  policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "PublicReadGetObject",
                "Effect": "Allow",
                "Principal": "*",
                "Action": [
                    "s3:GetObject"
                ],
                "Resource": [
                    "arn:aws:s3:::${bucket.id}/*"
                ]
            }
        ]
    }`,
});

// Create a Cognito User Pool
const userPool = new aws.cognito.UserPool('user-pool');

const userPoolClient = new aws.cognito.UserPoolClient('client', {
  userPoolId: userPool.id,
});

// Create Cognito Identity Pool using Federated Identities
const identityPool = new aws.cognito.IdentityPool('pool', {
  identityPoolName: 'my-pool',
  allowUnauthenticatedIdentities: true,
  cognitoIdentityProviders: [
    {
      clientId: userPoolClient.id,
      providerName: userPool.endpoint,
    },
  ],
});

const authenticatedRole = new aws.iam.Role('authenticatedRole', {
  assumeRolePolicy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Federated": "cognito-identity.amazonaws.com"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "cognito-identity.amazonaws.com:aud": "${identityPool.id}"
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated"
          }
        }
      }
    ]
  }
  `,
});

const authenticatedRolePolicy = new aws.iam.RolePolicy(
  'authenticatedRolePolicy',
  {
    role: authenticatedRole.id,
    policy: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "mobileanalytics:PutEvents",
        "cognito-sync:*",
        "cognito-identity:*"
      ],
      "Resource": [
        "*"
      ]
    }
  ]
}
`,
  },
);

const unauthenticatedRole = new aws.iam.Role('unauthenticatedRole', {
  assumeRolePolicy: pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Federated": "cognito-identity.amazonaws.com"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "cognito-identity.amazonaws.com:aud": "${identityPool.id}"
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated"
          }
        }
      }
    ]
  }
  `,
});

const unauthenticatedRolePolicy = new aws.iam.RolePolicy(
  'unauthenticatedRolePolicy',
  {
    role: unauthenticatedRole.id,
    policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "mobileanalytics:PutEvents",
                    "cognito-sync:*",
                    "cognito-identity:*"
                ],
                "Resource": [
                    "*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                   "s3:DeleteObject",
                   "s3:GetObject",
                   "s3:ListBucket",
                   "s3:PutObject",
                   "s3:PutObjectAcl"
                ],
                "Resource": [
                   "arn:aws:s3:::${bucket.id}",
                   "arn:aws:s3:::${bucket.id}/*"
                ]
            }
        ]
    }`,
  },
);

const mainIdentityPoolRoleAttachment =
  new aws.cognito.IdentityPoolRoleAttachment('mainIdentityPoolRoleAttachment', {
    identityPoolId: identityPool.id,
    roleMappings: [
      {
        identityProvider: pulumi.interpolate`cognito-idp.ap-southeast-2.amazonaws.com/${userPool.id}:${userPoolClient.id}`,
        ambiguousRoleResolution: 'AuthenticatedRole',
        type: 'Token',
      },
    ],
    roles: {
      authenticated: authenticatedRole.arn,
      unauthenticated: unauthenticatedRole.arn,
    },
  });

// Export the name of the bucket
export const bucketName = bucket.id;
export const identityPoolId = identityPool.id;
