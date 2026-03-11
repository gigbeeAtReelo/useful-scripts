/**
 * fetchStoreGroupIds.js
 *
 * Fetches unique customers from loyalty_points (filtered by 14 group_ids),
 * looks up their store_ids from customer_segments, then classifies each store
 * as either a group-store (collecting its group field) or a standalone store
 * (collecting its _id). Writes deduplicated results to output file.
 *
 * Usage:  node fetchStoreGroupIds.js
 */
const dotenv = require('dotenv')
dotenv.config()

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const ObjectId = mongoose.Types.ObjectId

let MongoConnection =
  require('./src/services/mongooseConnection.service.js').getInst()

const { Customer, CustomerSegment } = require('./src/models')

/**
 * CONFIGURATION
 */
const BATCH_SIZE = 1000
const STORE_LOOKUP_BATCH = 500

// The 14 group_ids to filter loyalty_points by
const GROUP_IDS = [
  '631ba5bfaeecca7b849452a7',
  '636d64619b891e1c5c7f8d88',
  '6384d6179b15705659f04572',
  '63dde3702e55f7ac3f6caa46',
  '641192a2c29d0054ec8a44d4',
  '64d4ab6eda7912717f892edc',
  '66c82759bae36408115617e0',
  '66dab4b19cba74fdd8a6b1ba',
  '68778bea82be8103e3cf8533',
  '6931c5a088b74fa4a11e3b45',
  '693a61fd54be5860df17c4c7',
  '6940edd0a3e986fa5baba203',
  '697085a083e34bddfa0ceb5a',
  '698593772019c04ad2045d75',
].map((id) => ObjectId(id))

/**
 * Step 1: Stream unique customer_ids from loyalty_points
 * Step 2: For each batch, query customer_segments for distinct store_ids
 * Returns a Set of unique store_id strings
 */
async function fetchUniqueStoreIds() {
  const uniqueStoreIds = new Set()

  // Aggregation cursor over loyalty_points
  const cursor = Customer.LoyaltyPoint.collection.aggregate(
    [
      {
        $match: {
          group_id: { $in: GROUP_IDS },
        },
      },
      {
        $group: {
          _id: '$customer_id',
        },
      },
    ],
    {
      allowDiskUse: true,
      cursor: { batchSize: BATCH_SIZE },
    }
  )

  let batch = []
  let totalCustomers = 0

  while (await cursor.hasNext()) {
    const doc = await cursor.next()
    batch.push(doc._id)

    if (batch.length >= BATCH_SIZE) {
      totalCustomers += batch.length
      console.log(`Streamed ${totalCustomers} customers so far...`)

      // Query customer_segments for distinct store_ids for this batch
      await collectStoreIdsFromSegments(batch, uniqueStoreIds)
      batch = []
    }
  }

  // Process remaining batch
  if (batch.length > 0) {
    totalCustomers += batch.length
    await collectStoreIdsFromSegments(batch, uniqueStoreIds)
  }

  console.log(`Total unique customers processed: ${totalCustomers}`)
  console.log(`Total unique store_ids found: ${uniqueStoreIds.size}`)

  return uniqueStoreIds
}

/**
 * Step 2 helper: For a batch of customer_ids, find distinct store_ids
 * from customer_segments and add them to the Set.
 * Uses the { customer_id: 1 } index on customer_segments.
 */
async function collectStoreIdsFromSegments(customerIds, storeIdSet) {
  const segCursor = CustomerSegment.collection.aggregate(
    [
      {
        $match: {
          customer_id: { $in: customerIds },
        },
      },
      {
        $group: {
          _id: '$store_id',
        },
      },
    ],
    {
      allowDiskUse: true,
      cursor: { batchSize: BATCH_SIZE },
    }
  )

  while (await segCursor.hasNext()) {
    const doc = await segCursor.next()
    storeIdSet.add(doc._id.toString())
  }
}

/**
 * Step 3: Batch-lookup stores and classify by group vs individual
 * Uses raw collection to bypass the pre-find hook on the Store model.
 * Returns { groupIds: Set, storeIds: Set }
 */
async function classifyStores(uniqueStoreIds) {
  const groupIds = new Set()
  const storeIds = new Set()

  const storeIdArray = Array.from(uniqueStoreIds).map((id) => ObjectId(id))
  const storesCollection = mongoose.connection.db.collection('stores')

  // Process stores in batches
  for (let i = 0; i < storeIdArray.length; i += STORE_LOOKUP_BATCH) {
    const batchIds = storeIdArray.slice(i, i + STORE_LOOKUP_BATCH)

    const storeDocs = await storesCollection
      .find(
        { _id: { $in: batchIds } },
        { projection: { _id: 1, group: 1 } }
      )
      .toArray()

    for (const store of storeDocs) {
      if (store.group) {
        const gid = store.group.toString()
        if (!groupIds.has(gid)) {
          groupIds.add(gid)
        }
      } else {
        const sid = store._id.toString()
        if (!storeIds.has(sid)) {
          storeIds.add(sid)
        }
      }
    }

    console.log(
      `Looked up stores batch ${Math.floor(i / STORE_LOOKUP_BATCH) + 1} ` +
        `(${Math.min(i + STORE_LOOKUP_BATCH, storeIdArray.length)}/${storeIdArray.length})`
    )
  }

  return { groupIds, storeIds }
}

/**
 * Step 5: Write output
 */
function writeOutput(groupIds, storeIds) {
  const output = {
    group_ids: Array.from(groupIds),
    store_ids: Array.from(storeIds),
  }

  const outputPath = path.join(__dirname, 'output_store_group_ids.json')
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))

  console.log(`\nResults written to ${outputPath}`)
  console.log(`  Group IDs: ${groupIds.size}`)
  console.log(`  Store IDs (individual): ${storeIds.size}`)
}

/**
 * Main runner
 */
async function run() {
  console.log('Step 1 & 2: Fetching unique customers and their store_ids...')
  const uniqueStoreIds = await fetchUniqueStoreIds()

  console.log('\nStep 3 & 4: Looking up stores and classifying...')
  const { groupIds, storeIds } = await classifyStores(uniqueStoreIds)

  console.log('\nStep 5: Writing output...')
  writeOutput(groupIds, storeIds)

  console.log('\nDone!')
}

MongoConnection.connect(async function (error, connected) {
  if (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }

  try {
    await run()
    process.exit(0)
  } catch (err) {
    console.error('Script error:', err)
    process.exit(1)
  }
})

const unexpectedErrorHandler = (error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
}

process.on('uncaughtException', unexpectedErrorHandler)
process.on('unhandledRejection', unexpectedErrorHandler)
process.on('SIGTERM', unexpectedErrorHandler)
process.on('SIGINT', unexpectedErrorHandler)
