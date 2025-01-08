import { Key } from 'aws-cdk-lib/aws-kms';
import { App, Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { LoggingProtocol, Topic, TracingConfig } from 'aws-cdk-lib/aws-sns';
import { ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import * as integ from '@aws-cdk/integ-tests-alpha';

class SNSInteg extends Stack {
  public readonly encryptedTopic: Topic;

  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const key = new Key(this, 'CustomKey', {
      pendingWindow: Duration.days(7),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const topic = new Topic(this, 'MyTopic', {
      topicName: 'fooTopic',
      displayName: 'fooDisplayName',
      masterKey: key,
    });

    const feedbackRole = new Role(this, 'FeedbackRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
    });
    const deliveryLoggingPolicy = new ManagedPolicy(this, 'Policy', {
      document: new PolicyDocument({
        statements: [new PolicyStatement({
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:PutMetricFilter',
            'logs:PutRetentionPolicy',
          ],
          resources: ['*'],
        })],
      }),
    });
    deliveryLoggingPolicy.attachToRole(feedbackRole);

    topic.addLoggingConfig({
      protocol: LoggingProtocol.HTTP,
      failureFeedbackRole: feedbackRole,
      successFeedbackRole: feedbackRole,
      successFeedbackSampleRate: 50,
    });

    // Topic with signatureVersion
    new Topic(this, 'MyTopicSignatureVersion', {
      topicName: 'fooTopicSignatureVersion',
      displayName: 'fooDisplayNameSignatureVersion',
      signatureVersion: '2',
    });

    // Topic with tracingConfig
    new Topic(this, 'MyTopicTracingConfig', {
      topicName: 'fooTopicTracingConfig',
      displayName: 'fooDisplayNameTracingConfig',
      tracingConfig: TracingConfig.ACTIVE,
    });

    // Can import topic
    const topic2 = new Topic(this, 'MyTopic2', {
      topicName: 'fooTopic2',
      displayName: 'fooDisplayName2',
    });
    const importedTopic2 = Topic.fromTopicArn(this, 'ImportedTopic2', topic2.topicArn);

    const publishRole = new Role(this, 'PublishRole', {
      assumedBy: new ServicePrincipal('s3.amazonaws.com'),
    });
    importedTopic2.grantPublish(publishRole);

    // Can import encrypted topic by attributes
    const topic3 = new Topic(this, 'MyTopic3', {
      topicName: 'fooTopic3',
      displayName: 'fooDisplayName3',
      masterKey: key,
    });
    const importedTopic3 = Topic.fromTopicAttributes(this, 'ImportedTopic3', {
      topicArn: topic3.topicArn,
      keyArn: key.keyArn,
    });
    importedTopic3.grantPublish(publishRole);
    this.encryptedTopic = topic3;
  }
}

const app = new App();

const stack = new SNSInteg(app, 'SNSInteg');

const testCase = new integ.IntegTest(app, 'SNSTest', {
  testCases: [stack],
});

const publishMessage = testCase.assertions.awsApiCall('aws-sns', 'PublishMessage', {
  topicArn: stack.encryptedTopic.topicArn,
  message: 'hello world',
});

publishMessage.expect(integ.ExpectedResult.objectLike({
  MessageId: integ.ExpectedResult.stringLikeRegexp('.+'),
}));

app.synth();
