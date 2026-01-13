const { ECSClient, DescribeTasksCommand } = require('@aws-sdk/client-ecs')
require('dotenv').config()

const TASK_ARN = process.argv[2] || 'arn:aws:ecs:us-east-1:840983897776:task/receiver-dev-fargate-cluster/813fd95d611a4e90bbf47809f0d5994f'
const CLUSTER = 'receiver-dev-fargate-cluster'


// 
async function describeEcsTask() {
  const ecsClient = new ECSClient({
    region: 'us-east-1',
  })

  const command = new DescribeTasksCommand({
    cluster: CLUSTER,
    tasks: [TASK_ARN],
  })

  try {
    const response = await ecsClient.send(command)
    
    if (response.tasks && response.tasks.length > 0) {
      const task = response.tasks[0]
      
      console.log('Task ARN:', task.taskArn)
      console.log('Status:', task.lastStatus)
      console.log('Created At:', task.createdAt)
      
      // Extract environment variables from container overrides
      const overrides = task.overrides?.containerOverrides?.[0]?.environment || []
      
      console.log('\n--- Environment Variables ---')
      for (const env of overrides) {
        console.log(`${env.name}: ${env.value}`)
        
        // Parse ECS_EVENT_DATA to get the prefix
        if (env.name === 'ECS_EVENT_DATA') {
          try {
            const eventData = JSON.parse(env.value)
            console.log('\n--- Parsed ECS_EVENT_DATA ---')
            console.log('Queue Prefix:', eventData.prefix)
            console.log('Key:', eventData.key)
            console.log('Redis Database:', eventData.REDIS_DATABASE)
            
            // Show the full queue name
            const queueName = `${eventData.prefix}_CAMPAIGNS`
            console.log('\n--- Bull Queue Info ---')
            console.log('Full Queue Name:', queueName)
            console.log('Job Key Pattern:', `bull:${queueName}:<jobId>`)
          } catch (e) {
            console.log('Could not parse ECS_EVENT_DATA')
          }
        }
      }
    } else if (response.failures && response.failures.length > 0) {
      console.log('Task not found or failed:')
      console.log(response.failures)
    }
  } catch (error) {
    console.error('Error describing task:', error.message)
  }
}

describeEcsTask()


