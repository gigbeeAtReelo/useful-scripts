const {
  SchedulerClient,
  GetScheduleCommand,
} = require('@aws-sdk/client-scheduler')
const AWSScheduler = require('../src/services/awsscheduler.service.js').getInst()
const fs = require('fs')
const path = require('path')
const moment = require('moment-timezone')
require('dotenv').config()


// Initialize the scheduler client
const scheduler = new SchedulerClient({
  region: process.env.AWS_DEFAULT_REGION || 'ap-south-1',
})

const campaignIds = [
  {
    _id: '64bd842ab368b453d9497605',
    runs_at: '07:00pm',
    entity_id: '680609c9c9c00b0ca845fcbb',
  },
  {
    _id: '64e6411c167df0aa8a7d072e',
    runs_at: '07:00pm',
    entity_id: '680609c9c9c00b0ca845fcbb',
  },
  {
    _id: '65e06d3fb7fdcdbce41c1352',
    runs_at: '10:00am',
    entity_id: '65c32ab0380bed6d808001fc',
  },
  {
    _id: '65e06e4db7fdcdbce41c7953',
    runs_at: '12:00pm',
    entity_id: '65c32ab0380bed6d808001fc',
  },
  {
    _id: '673dd040b020c8f94bb845ea',
    runs_at: '11:00am',
    entity_id: '66f7c93fa4527b87d9ca42af',
  },
  {
    _id: '673dd2677eda73f93f791ca2',
    runs_at: '11:00am',
    entity_id: '66f7c93fa4527b87d9ca42af',
  },
  {
    _id: '673dd4630bafc0f9458b6989',
    runs_at: '11:00am',
    entity_id: '66f7c93fa4527b87d9ca42af',
  },
  {
    _id: '6748338cc2ad73bec682837f',
    runs_at: '11:00am',
    entity_id: '6560a711b4010fe980400850',
  },
  {
    _id: '675ffb0062e5e16571980b06',
    runs_at: '06:00pm',
    entity_id: '670f4d4b2f7186a53f10da4c',
  },
  {
    _id: '678786f5b33efa74a3b281a2',
    runs_at: '10:00am',
    entity_id: '65c32ab0380bed6d808001fc',
  },
  {
    _id: '680a2772fc504639c63efc9d',
    runs_at: '10:00am',
    entity_id: '646cac101f18d7a2bb95fdc3',
  },
  {
    _id: '680f30b7177f9209f579c0f2',
    runs_at: '10:00am',
    entity_id: '6572c299fbeab4b2ae5f78a1',
  },
  {
    _id: '680f32e14ff60809e905a247',
    runs_at: '10:00am',
    entity_id: '6572c299fbeab4b2ae5f78a1',
  },
  {
    _id: '680f34d724b6c109d0598e97',
    runs_at: '10:00am',
    entity_id: '6572c299fbeab4b2ae5f78a1',
  },
  {
    _id: '680f398d4ff60809e906750a',
    runs_at: '10:00am',
    entity_id: '6572c299fbeab4b2ae5f78a1',
  },
  {
    _id: '6826fb80e07ef51311acaba9',
    runs_at: '10:00am',
    entity_id: '67e3a5c4b623b20a0155fe72',
  },
  {
    _id: '684c45a5feda477e9044e898',
    runs_at: '08:00pm',
    entity_id: '682d66a6ec0da851f9b2b1cd',
  },
  {
    _id: '68598061a0bed2a8dd168f82',
    runs_at: '10:00am',
    entity_id: '687e218ad640ae8bfb859f0e',
  },
  {
    _id: '68598b4d53bfd5a8eb5405a3',
    runs_at: '10:00am',
    entity_id: '687e218ad640ae8bfb859f0e',
  },
  {
    _id: '685acd9375faecc13aa22a4b',
    runs_at: '10:00am',
    entity_id: '687e218ad640ae8bfb859f0e',
  },
  {
    _id: '685e84e1fbb4310b8eb7aeef',
    runs_at: '10:00am',
    entity_id: '687e218ad640ae8bfb859f0e',
  },
  {
    _id: '685f241cd76d920b8026d3c0',
    runs_at: '09:02am',
    entity_id: '646cac101f18d7a2bb95fdc3',
  },
  {
    _id: '68679a54bbf602220b285c85',
    runs_at: '11:59am',
    entity_id: '646cac101f18d7a2bb95fdc3',
  },
  {
    _id: '686ab7ff7acbc7386a0cf109',
    runs_at: '07:00pm',
    entity_id: '680609c9c9c00b0ca845fcbb',
  },
  {
    _id: '6870ac3da9cbb01d8259a4b3',
    runs_at: '10:00am',
    entity_id: '6572c299fbeab4b2ae5f78a1',
  },
  {
    _id: '687f4bce84bd378c1ee6460c',
    runs_at: '10:00am',
    entity_id: '6847d8f2861be443007767cd',
  },
  {
    _id: '6880ae29811c07f622691f6d',
    runs_at: '09:00am',
    entity_id: '67c17e44b623b20a019c73cb',
  },
  {
    _id: '6880b592861c25f61514918c',
    runs_at: '09:00am',
    entity_id: '67c17e44b623b20a019c73cb',
  },
  {
    _id: '6880cefae98c67f60f0c0f46',
    runs_at: '09:00am',
    entity_id: '67c17e44b623b20a019c73cb',
  },
  {
    _id: '6880d1c79a7aa2f630bf14dc',
    runs_at: '09:00am',
    entity_id: '67c17e44b623b20a019c73cb',
  },
  {
    _id: '6880d3de861c25f61519ec4e',
    runs_at: '09:00am',
    entity_id: '67c17e44b623b20a019c73cb',
  },
  {
    _id: '688c5ef4851fe0afac63f681',
    runs_at: '10:00am',
    entity_id: '6858fa38ec0da851f961c282',
  },
  {
    _id: '688c62f452b439afb28150cd',
    runs_at: '10:00am',
    entity_id: '6858fa38ec0da851f961c282',
  },
  {
    _id: '6890b114752c3bb5316bc1e9',
    runs_at: '12:01pm',
    entity_id: '687a1be5ec0da851f98b6dec',
  },
  {
    _id: '6894518b8b9c44a439f5a59b',
    runs_at: '10:00am',
    entity_id: '687a1be5ec0da851f98b6dec',
  },
  {
    _id: '6895debd5c9d9bb4d4cd5599',
    runs_at: '09:00am',
    entity_id: '682d66a6ec0da851f9b2b1cd',
  },
  {
    _id: '689f2303faca0feb0522d70c',
    runs_at: '10:00am',
    entity_id: '682d66a6ec0da851f9b2b1cd',
  },
  {
    _id: '68a725ddc9756c65a843cadc',
    runs_at: '10:00am',
    entity_id: '68a458e6418f2f0792b96a4d',
  },
  {
    _id: '68a824ad388e66ecd799207e',
    runs_at: '10:00am',
    entity_id: '68a458e6418f2f0792b96a4d',
  },
  {
    _id: '68a827ef388e66ecd799ae9c',
    runs_at: '10:00am',
    entity_id: '68a458e6418f2f0792b96a4d',
  },
  {
    _id: '68a845b216fe88ecc2f17527',
    runs_at: '10:00am',
    entity_id: '68a458e6418f2f0792b96a4d',
  },
  {
    _id: '68b55bed34d41ca248266dcd',
    runs_at: '12:00pm',
    entity_id: '68ac1910ec0da851f94d5e8c',
  },
  {
    _id: '68b55ddb4d3f44a242d90da7',
    runs_at: '12:00pm',
    entity_id: '68ac1910ec0da851f94d5e8c',
  },
  {
    _id: '68b55f9ea560a9a22d4db89e',
    runs_at: '12:00pm',
    entity_id: '68ac1910ec0da851f94d5e8c',
  },
  {
    _id: '68b561642f25a8a2333eb389',
    runs_at: '12:00pm',
    entity_id: '68ac1910ec0da851f94d5e8c',
  },
  {
    _id: '68b5627a2f25a8a2333ee416',
    runs_at: '12:00pm',
    entity_id: '68ac1910ec0da851f94d5e8c',
  },
  {
    _id: '68c00548bb9b460440cd302f',
    runs_at: '09:00am',
    entity_id: '685e9392ec0da851f9c7c83c',
  },
  {
    _id: '68c00a0c225c9d328a23fe44',
    runs_at: '09:00am',
    entity_id: '685e9392ec0da851f9c7c83c',
  },
  {
    _id: '68dcc5bbffc9dc1a9513de71',
    runs_at: '10:00am',
    entity_id: '68bd9290ec0da851f9099a6b',
  },
  {
    _id: '68dcc82e2996841a8e25d8ee',
    runs_at: '07:00am',
    entity_id: '68bd9290ec0da851f9099a6b',
  },
  {
    _id: '68dcc9a37ec6c41a8d275c15',
    runs_at: '07:00am',
    entity_id: '68bd9290ec0da851f9099a6b',
  },
  {
    _id: '68f0b9ee069e102f9cbf85a7',
    runs_at: '10:00am',
    entity_id: '66f7c93fa4527b87d9ca42af',
  },
  {
    _id: '690871368cefdbb00907f9b1',
    runs_at: '12:00pm',
    entity_id: '6915d2953a0920e55a26696a',
  },
  {
    _id: '694b90e86c7c8764f331f32f',
    runs_at: '10:00am',
    entity_id: '68f7adeaec0da851f9a5d820',
  },
]

// Configuration
const CONFIG = {
  CONCURRENCY: 10, // Number of concurrent API calls
  RETRY_DELAY_MS: 1000, // Base delay for retries
  MAX_RETRIES: 3, // Max retries for throttling
  GROUP_NAME: 'default', // EventBridge schedule group name
}

/**
 * Check if a schedule exists for the given name
 * @param {string} scheduleName - The schedule name (campaign ID)
 * @returns {Promise<{exists: boolean, error?: string}>}
 */
async function checkScheduleExists(scheduleName) {
  try {
    await scheduler.send(
      new GetScheduleCommand({
        Name: scheduleName,
        GroupName: CONFIG.GROUP_NAME,
      })
    )
    return { exists: true }
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return { exists: false }
    }
    // For other errors (throttling, etc.), throw to trigger retry
    throw error
  }
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry(fn, retries = CONFIG.MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === retries) throw error
      if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException') {
        const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt)
        console.log(`Rate limited, retrying in ${delay}ms...`)
        await sleep(delay)
      } else {
        throw error
      }
    }
  }
}

async function createSchedule(details) {
  return new Promise((resolve, reject) => {
    let runs_at = moment(details.run_at, ['h:mm A'])
      .format('HH:mm')
      .split(':')
      .map(ele => parseInt(ele))
    let cronExpression = `${runs_at[1]} ${runs_at[0]} * * ? *`
    let startDate = moment()
      .tz(details?.timezone ?? 'Asia/Kolkata')
      .endOf('day')
      .utc()
      .format()
    AWSScheduler.createSchedule(
      {
        name: details._id.toString(),
        timezone: details?.timezone ?? 'Asia/Kolkata',
        startDate: startDate,
        cronExpression: cronExpression,
        // schedule_at: moment().format('YYYY-MM-DDTHH:mm:ss'),
        Arn: process.env.ECS_TASK_PROCESS_FUNCTION_ARN,
        RoleArn: process.env.EVENT_BRIDGE_ROLE_ARN,
        Input: JSON.stringify({
          campaignId: details._id.toString(),
          storeId: details.entity_id.toString(),
          key: 'campaign',
          priority: '1',
        }),
        DLQ_ARN: process.env.ECS_TASK_PROCESS_DLQ_QUEUE_ARN + '-dlq',
      },
      (error, data) => {
        if (error) {
          console.log(`Error creating schedule for ${details._id.toString()}: ${error}`)
          reject(error)
        } else {
          console.log(`Schedule created for ${details._id.toString()}`)
          resolve(data)
        }
      }
    )
  })
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Process IDs in batches with concurrency control
 */
async function processBatch(ids, concurrency) {
  const results = {
    withSchedule: [],
    withoutSchedule: [],
    errors: [],
  }

  let processed = 0
  const total = ids.length

  // Process in chunks
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency)

    const batchResults = await Promise.all(
      batch.map(async (id) => {
        try {
          const result = await withRetry(() => createSchedule(id))
          return { id, ...result }
        } catch (error) {
          return { id, exists: false, error: error.message }
        }
      })
    )

    // Categorize results
    for (const result of batchResults) {
      if (result.error) {
        results.errors.push({ id: result.id, error: result.error })
      } else if (result.exists) {
        results.withSchedule.push(result.id)
      } else {
        results.withoutSchedule.push(result.id)
      }
    }

    processed += batch.length
    const percent = ((processed / total) * 100).toFixed(1)
    console.log(`Progress: ${processed}/${total} (${percent}%) - With: ${results.withSchedule.length}, Without: ${results.withoutSchedule.length}, Errors: ${results.errors.length}`)

    // Small delay between batches to be nice to the API
    if (i + concurrency < ids.length) {
      await sleep(100)
    }
  }

  return results
}

/**
 * Main execution
 */
async function main() {
  console.log('========================================')
  console.log('EventBridge Schedule Checker')
  console.log('========================================')

  if (campaignIds.length === 0) {
    console.error('❌ No campaign IDs provided. Please paste your IDs in the campaignIds array.')
    process.exit(1)
  }

  console.log(`\n📋 Total IDs to check: ${campaignIds.length}`)
  console.log(`⚡ Concurrency: ${CONFIG.CONCURRENCY}`)
  console.log(`📁 Group Name: ${CONFIG.GROUP_NAME}`)
  console.log('\n🔍 Starting check...\n')

  const startTime = Date.now()
  const results = await processBatch(campaignIds, CONFIG.CONCURRENCY)
  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  // Print summary
  console.log('\n========================================')
  console.log('RESULTS SUMMARY')
  console.log('========================================')
  console.log(`✅ With Schedule: ${results.withSchedule.length}`)
  console.log(`❌ Without Schedule: ${results.withoutSchedule.length}`)
  console.log(`⚠️  Errors: ${results.errors.length}`)
  console.log(`⏱️  Duration: ${duration}s`)

  // Write results to files
  // const outputDir = path.join(__dirname, '../output')
  // if (!fs.existsSync(outputDir)) {
  //   fs.mkdirSync(outputDir, { recursive: true })
  // }

  // const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

  // // IDs without schedules
  // const missingSchedulesFile = path.join(outputDir, `missing_schedules_${timestamp}.json`)
  // fs.writeFileSync(
  //   missingSchedulesFile,
  //   JSON.stringify(
  //     {
  //       count: results.withoutSchedule.length,
  //       ids: results.withoutSchedule,
  //     },
  //     null,
  //     2
  //   )
  // )
  // console.log(`\n📄 Missing schedules saved to: ${missingSchedulesFile}`)

  // IDs with schedules
  // const existingSchedulesFile = path.join(outputDir, `existing_schedules_${timestamp}.json`)
  // fs.writeFileSync(
  //   existingSchedulesFile,
  //   JSON.stringify(
  //     {
  //       count: results.withSchedule.length,
  //       ids: results.withSchedule,
  //     },
  //     null,
  //     2
  //   )
  // )
  // console.log(`📄 Existing schedules saved to: ${existingSchedulesFile}`)

  // Errors (if any)
  // if (results.errors.length > 0) {
  //   const errorsFile = path.join(outputDir, `check_errors_${timestamp}.json`)
  //   fs.writeFileSync(errorsFile, JSON.stringify(results.errors, null, 2))
  //   console.log(`📄 Errors saved to: ${errorsFile}`)
  // }

  // // Also print the missing IDs to console for quick copy
  // if (results.withoutSchedule.length > 0 && results.withoutSchedule.length <= 50) {
  //   console.log('\n❌ IDs without schedules:')
  //   console.log(JSON.stringify(results.withoutSchedule, null, 2))
  // }

  console.log('\n✨ Done!')
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})


