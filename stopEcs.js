const { ECSClient, StopTaskCommand } = require('@aws-sdk/client-ecs')
require('dotenv').config()

const TASK_ARN = 'arn:aws:ecs:us-east-1:840983897776:task/receiver-dev-fargate-cluster/2949926a26214ec5b4c2617928d0155d'
const CLUSTER = 'receiver-dev-fargate-cluster'

async function stopEcsTask() {
  const ecsClient = new ECSClient({
    region: 'us-east-1',
  })

  const command = new StopTaskCommand({
    cluster: CLUSTER,
    task: TASK_ARN,
    reason: 'Manual stop via script',
  })

  try {
    const response = await ecsClient.send(command)
    console.log('Task stopped successfully:')
    console.log(JSON.stringify(response, null, 2))
  } catch (error) {
    console.error('Error stopping task:', error.message)
  }
}

stopEcsTask()


