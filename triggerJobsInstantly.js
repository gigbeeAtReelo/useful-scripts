require('dotenv').config()
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs')

const queueUrl = process.env.AWS_SQS_JOB_TRIGGER_QUEUE
//const queueUrl = process.env.PROD_AWS_SQS_JOB_TRIGGER_QUEUE
if (!queueUrl) throw new Error('Set QUEUE_URL')

const region = process.env.AWS_SQS_DEFAULT_REGION || 'ap-south-1'

// const ECS_EVENT_DATA = {
//   key: "loyalty",
//   storeId: "69393e45c5a7173ddd3a373d",
//   loyaltyId: "697c8ae3f92d13547ebb0ea3",
//   type: "Group",
//   points: 0,
//   loyalty: "loyaltyPointsReminder",
//   timezone: "Asia/Kolkata",
//   channels: [{ name: "whatsapp", status: true }, { name: "sms", status: false }],
//   unit: "day",
//   days: 1,
//   isReminder: false,
// };

const ECS_EVENT_DATA = {
  key: 'campaign',
  campaignId: '69e644fd9ff152faa7af72cd',
}

const test = async () => {
  const client = new SQSClient({ region })
  const cmd = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: '{}',
    MessageAttributes: {
      ECS_EVENT_DATA: {
        DataType: 'String',
        StringValue: JSON.stringify(ECS_EVENT_DATA),
      },
      NAME: {
        DataType: 'String',
        StringValue: 'campaign',
      },
      TYPE: {
        DataType: 'String',
        StringValue: 'FARGATE',
      },
    },
  })

  const res = await client.send(cmd)
  console.log('Sent. MessageId:', res.MessageId)
}

test()
