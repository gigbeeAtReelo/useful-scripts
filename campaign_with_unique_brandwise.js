const MongoConnection =
  require('./src/services/mongooseConnection.service.js').getInst()
const { Store, Group, Campaign } = require('./src/models')
const { ObjectId } = require('mongoose').Types
const moment = require('moment')
const groupService = require('./src/services/group.service')
const async = require('async')
require('dotenv').config()
// ============ CONFIGURATION ============
// Pass dates as command line arguments or modify these defaults
// Usage: node test6.js "2024-01-01" "2024-12-31" [entityId]
// Examples:
//   node test6.js "2024-01-01" "2024-12-31"                    - All entities
//   node test6.js "2024-01-01" "2024-12-31" "507f1f77bcf86cd799439011" - Specific entity
const START_DATE = process.argv[2]
  ? moment(process.argv[2]).startOf('day').toDate()
  : moment('2025-12-01').startOf('day').toDate()
const END_DATE = process.argv[3]
  ? moment(process.argv[3]).endOf('day').toDate()
  : moment('2025-12-31').endOf('day').toDate()
const SPECIFIC_ENTITY_ID = process.argv[4] || null
// =======================================

const unexpectedErrorHandler = async error => {
  MongoConnection.disconnect()
  console.error('Unexpected error:', error)
  process.exit(89)
}

process.on('uncaughtException', unexpectedErrorHandler)
process.on('unhandledRejection', unexpectedErrorHandler)
process.on('SIGTERM', unexpectedErrorHandler)
process.on('SIGINT', unexpectedErrorHandler)

async function getEntityIds() {
  // Fetch only the group IDs and individual store IDs (brands only)
  console.log('\n📦 Fetching all brands (groups and individual stores)...\n')

  // Fetch groups with growth plan using aggregation:
  // 1. Lookup users collection using owner key
  // 2. Get user_id from users
  // 3. Lookup subscriptions with user_id, sorted by created_at: -1
  // 4. Filter for growth plan only
  const groups = await Group.aggregate([
    // Lookup user from users collection using owner field
    {
      $lookup: {
        from: 'users',
        localField: 'owner',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },
    // Lookup subscription from subscriptions collection using user._id
    {
      $lookup: {
        from: 'subscriptions',
        let: { userId: '$user._id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$user_id', '$$userId'] },
              plan: 'growth',
            },
          },
          { $limit: 1 },
        ],
        as: 'subscription',
      },
    },
    { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: false } },
    // Filter only groups with growth plan
    { $match: { 'subscription.plan': 'growth' } },
    // Project only needed fields
    {
      $project: {
        _id: 1,
        name: 1,
      },
    },
  ]).allowDiskUse(true)

  console.log(`Found ${groups.length} groups with growth plan (brands)`)

  // Fetch all individual store IDs - stores that don't belong to any group
  const individualStores = await Store.find(
    { group: { $exists: false }, type: 'individual', plan: 'growth' },
    { _id: 1, name: 1 }
  ).lean()
  console.log(
    `Found ${individualStores.length} individual stores with growth plan (brands not in any group)`
  )

  // Build entityIds array - only brand IDs (group IDs + individual store IDs)
  const entityIds = []

  // Add group IDs
  for (const group of groups) {
    entityIds.push(group._id)
  }

  // Add individual store IDs
  for (const store of individualStores) {
    entityIds.push(store._id)
  }

  const totalBrands = groups.length + individualStores.length
  console.log(`\nTotal brands with growth plan: ${totalBrands}`)

  return { entityIds, groups, individualStores }
}

// Process a single GROUP brand and return campaign count
// Uses validateGroupOrStore to get all store IDs within the group
async function processGroupBrand(groupId, startDate, endDate) {
  const { isStore, store } = await groupService.validateGroupOrStore(groupId)

  if (!store || isStore) return null // Skip if not found or if it's actually a store

  // For group, include group ID + all store IDs within the group
  const storeIds = store.stores?.store_ids || []
  const entityIdFilter = { $in: [...storeIds, store._id] }

  // Build campaign filter for this group
  const campaignFilter = {
    entity_id: entityIdFilter,
    auto_campaign: { $exists: false },
    status: { $in: ['published', 'completed'] },
    $and: [
      { created_at: { $gte: startDate, $lte: endDate } },
      { schedule_at: { $gte: startDate, $lte: endDate } },
    ],
  }

  // Count campaigns for this brand
  const campaignCount = await Campaign.countDocuments(campaignFilter)

  return {
    entityId: store._id,
    entityType: 'Group',
    name: store.name,
    campaignCount,
  }
}

// Process all individual stores in a single query
async function processIndividualStores(individualStores, startDate, endDate) {
  console.log(
    `\n📊 Processing ${individualStores.length} individual stores in single query...`
  )

  const storeIds = individualStores.map(s => s._id)

  // Build campaign filter for all individual stores
  const campaignFilter = {
    entity_id: { $in: storeIds },
    auto_campaign: { $exists: false },
    status: { $in: ['published', 'completed'] },
    $and: [
      { created_at: { $gte: startDate, $lte: endDate } },
      { schedule_at: { $gte: startDate, $lte: endDate } },
    ],
  }

  // Aggregate to get campaign count per store
  const campaignsByStore = await Campaign.aggregate([
    { $match: campaignFilter },
    {
      $group: {
        _id: '$entity_id',
        campaignCount: { $sum: 1 },
      },
    },
    { $match: { campaignCount: { $gte: 1 } } },
  ]).allowDiskUse(true)

  // Build a map of storeId -> campaignCount
  const campaignCountMap = new Map()
  let totalCampaigns = 0
  for (const item of campaignsByStore) {
    campaignCountMap.set(item._id.toString(), item.campaignCount)
    totalCampaigns += item.campaignCount
  }

  // Build results for stores with campaigns
  const brandsWithCampaigns = []
  for (const store of individualStores) {
    const count = campaignCountMap.get(store._id.toString())
    if (count && count >= 1) {
      brandsWithCampaigns.push({
        entityId: store._id,
        entityType: 'Store',
        name: store.name,
        campaignCount: count,
      })
    }
  }

  console.log(
    `✓ Individual stores: ${brandsWithCampaigns.length} brands with campaigns, ${totalCampaigns} total campaigns`
  )

  return {
    totalCampaigns,
    uniqueBrandsWithCampaigns: brandsWithCampaigns.length,
    brandsWithCampaigns,
  }
}

// Process all group brands in parallel batches
async function processGroupBrands(groups, startDate, endDate) {
  console.log(
    `\n📊 Processing ${groups.length} groups in parallel batches of 50...`
  )

  const PARALLEL_BATCH_SIZE = 50
  let totalCampaigns = 0
  let uniqueBrandsWithCampaigns = 0
  const brandsWithCampaigns = []
  let processedCount = 0

  return new Promise((resolve, reject) => {
    async.eachLimit(
      groups,
      PARALLEL_BATCH_SIZE,
      function (group, callback) {
        processGroupBrand(group._id, startDate, endDate)
          .then(result => {
            processedCount++

            if (result) {
              totalCampaigns += result.campaignCount

              if (result.campaignCount >= 1) {
                uniqueBrandsWithCampaigns++
                brandsWithCampaigns.push(result)
              }
            }

            // Log progress every 100 groups
            if (processedCount % 100 === 0) {
              console.log(
                `Processed ${processedCount}/${groups.length} groups...`
              )
            }

            callback(null)
          })
          .catch(error => {
            console.error(`Error processing group ${group._id}:`, error)
            callback(null)
          })
      },
      function (error) {
        if (error) {
          console.error('Error processing groups:', error)
          return reject(error)
        }

        console.log(
          `✓ Groups: ${uniqueBrandsWithCampaigns} brands with campaigns, ${totalCampaigns} total campaigns`
        )

        resolve({
          totalCampaigns,
          uniqueBrandsWithCampaigns,
          brandsWithCampaigns,
        })
      }
    )
  })
}

async function getCampaignCountsByEntity(
  groups,
  individualStores,
  startDate,
  endDate
) {
  console.log('\n📊 Fetching campaigns within timeframe...\n')
  console.log(
    `Timeframe: ${startDate.toISOString()} to ${endDate.toISOString()}\n`
  )

  // Process individual stores in a single query (optimized)
  const storeResults = await processIndividualStores(
    individualStores,
    startDate,
    endDate
  )

  // Process groups in parallel batches (need validateGroupOrStore for each)
  const groupResults = await processGroupBrands(groups, startDate, endDate)

  // Combine results
  const totalCampaigns =
    storeResults.totalCampaigns + groupResults.totalCampaigns
  const uniqueBrandsWithCampaigns =
    storeResults.uniqueBrandsWithCampaigns +
    groupResults.uniqueBrandsWithCampaigns
  const brandsWithCampaigns = [
    ...storeResults.brandsWithCampaigns,
    ...groupResults.brandsWithCampaigns,
  ]

  console.log(`\n${'='.repeat(40)}`)
  console.log(`Total campaigns matching criteria: ${totalCampaigns}`)
  console.log(
    `🏢 Unique brands with at least 1 campaign: ${uniqueBrandsWithCampaigns}`
  )

  return {
    totalCampaigns,
    uniqueBrandsWithCampaigns,
    brandsWithCampaigns,
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('Campaign Count Analysis Script')
  console.log('='.repeat(60))

  try {
    let results

    if (SPECIFIC_ENTITY_ID) {
      // For specific entity, use processGroupBrand (works for both store and group)
      console.log(`\n🔍 Filtering by specific entity: ${SPECIFIC_ENTITY_ID}`)
      const result = await processGroupBrand(
        SPECIFIC_ENTITY_ID,
        START_DATE,
        END_DATE
      )

      if (result) {
        results = {
          totalCampaigns: result.campaignCount,
          uniqueBrandsWithCampaigns: result.campaignCount >= 1 ? 1 : 0,
          brandsWithCampaigns: result.campaignCount >= 1 ? [result] : [],
        }
      } else {
        // Try as individual store
        const store = await Store.findById(SPECIFIC_ENTITY_ID).lean()
        if (store) {
          const storeResults = await processIndividualStores(
            [store],
            START_DATE,
            END_DATE
          )
          results = storeResults
        } else {
          results = {
            totalCampaigns: 0,
            uniqueBrandsWithCampaigns: 0,
            brandsWithCampaigns: [],
          }
        }
      }
    } else {
      // Get all groups and individual stores
      const { groups, individualStores } = await getEntityIds()

      // Get campaign counts - optimized: single query for stores, parallel for groups
      results = await getCampaignCountsByEntity(
        groups,
        individualStores,
        START_DATE,
        END_DATE
      )
    }

    // Sort brands by campaign count
    const sortedBrands = results.brandsWithCampaigns.sort(
      (a, b) => b.campaignCount - a.campaignCount
    )

    console.log('\n' + '='.repeat(60))
    console.log('SUMMARY')
    console.log('='.repeat(60))
    console.log(
      `\n📅 Timeframe: ${START_DATE.toISOString()} to ${END_DATE.toISOString()}`
    )
    if (SPECIFIC_ENTITY_ID) {
      console.log(`🔍 Filtered by Entity ID: ${SPECIFIC_ENTITY_ID}`)
      if (sortedBrands.length > 0) {
        const entity = sortedBrands[0]
        console.log(`📛 Entity Name: ${entity.name}`)
        console.log(`📦 Entity Type: ${entity.entityType}`)
      }
    }
    console.log(`\n📊 Total Campaigns: ${results.totalCampaigns}`)
    console.log(
      `🏢 Unique Brands with at least 1 campaign: ${results.uniqueBrandsWithCampaigns}`
    )

    if (sortedBrands.length > 0 && !SPECIFIC_ENTITY_ID) {
      console.log('\n📈 Top 10 Brands by Campaign Count:')
      console.log('-'.repeat(60))
      const top10 = sortedBrands.slice(0, 10)
      for (let i = 0; i < top10.length; i++) {
        const brand = top10[i]
        console.log(
          `${i + 1}. ${brand.name} (${brand.entityType}): ${
            brand.campaignCount
          } campaigns`
        )
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ Script completed successfully')
    console.log('='.repeat(60))

    return {
      totalCampaigns: results.totalCampaigns,
      uniqueBrandsWithCampaigns: results.uniqueBrandsWithCampaigns,
      brandsWithCampaigns: sortedBrands,
    }
  } catch (error) {
    console.error('\n❌ Error during analysis:', error)
    throw error
  }
}

// Main execution
const handler = async function () {
  MongoConnection.connect(async function (error, connected) {
    if (error) {
      console.error('❌ MongoDB connection error:', error)
      process.exit(99)
      return
    }

    console.log('✓ Connected to MongoDB\n')

    try {
      const result = await main()

      console.log('\n✅ Script completed successfully')
      process.exit(0)
    } catch (exception) {
      console.error('\n❌ Exception error:', exception)
      console.error('Stack trace:', exception.stack)
      console.log('Exiting process with error')
      process.exit(99)
    }
  }, 1)
}

// Run the handler
handler()

// const MongoConnection =
//   require('./src/services/mongooseConnection.service.js').getInst()
// const { Store, Group, Campaign } = require('./src/models')
// const { ObjectId } = require('mongoose').Types
// const moment = require('moment')
// const groupService = require('./src/services/group.service')
// const async = require('async')

// // ============ CONFIGURATION ============
// // Pass dates as command line arguments or modify these defaults
// // Usage: node test6.js "2024-01-01" "2024-12-31" [entityId]
// // Examples:
// //   node test6.js "2024-01-01" "2024-12-31"                    - All entities
// //   node test6.js "2024-01-01" "2024-12-31" "507f1f77bcf86cd799439011" - Specific entity
// const START_DATE = process.argv[2]
//   ? moment(process.argv[2]).startOf('day').toDate()
//   : moment('2025-12-01').startOf('day').toDate()
// const END_DATE = process.argv[3]
//   ? moment(process.argv[3]).endOf('day').toDate()
//   : moment('2025-12-31').endOf('day').toDate()
// const SPECIFIC_ENTITY_ID = process.argv[4] || null
// // =======================================

// const unexpectedErrorHandler = async error => {
//   MongoConnection.disconnect()
//   console.error('Unexpected error:', error)
//   process.exit(89)
// }

// process.on('uncaughtException', unexpectedErrorHandler)
// process.on('unhandledRejection', unexpectedErrorHandler)
// process.on('SIGTERM', unexpectedErrorHandler)
// process.on('SIGINT', unexpectedErrorHandler)

// async function getEntityIds() {
//   // Fetch only the group IDs and individual store IDs (brands only)
//   console.log('\n📦 Fetching all brands (groups and individual stores)...\n')

//   // Fetch all group IDs - each group is 1 brand
//   const groups = await Group.find({}, { _id: 1, name: 1 }).lean()
//   console.log(`Found ${groups.length} groups (brands)`)

//   // Fetch all individual store IDs - stores that don't belong to any group
//   const individualStores = await Store.find(
//     { group: { $exists: false }, type: 'individual' },
//     { _id: 1, name: 1 }
//   ).lean()
//   console.log(
//     `Found ${individualStores.length} individual stores (brands not in any group)`
//   )

//   // Build entityIds array - only brand IDs (group IDs + individual store IDs)
//   const entityIds = []

//   // Add group IDs
//   for (const group of groups) {
//     entityIds.push(group._id)
//   }

//   // Add individual store IDs
//   for (const store of individualStores) {
//     entityIds.push(store._id)
//   }

//   const totalBrands = groups.length + individualStores.length
//   console.log(`\nTotal brands: ${totalBrands}`)

//   return { entityIds, groups, individualStores }
// }

// // Process a single GROUP brand and return campaign count
// // Uses validateGroupOrStore to get all store IDs within the group
// async function processGroupBrand(groupId, startDate, endDate) {
//   const { isStore, store } = await groupService.validateGroupOrStore(groupId)

//   if (!store || isStore) return null // Skip if not found or if it's actually a store

//   // For group, include group ID + all store IDs within the group
//   const storeIds = store.stores?.store_ids || []
//   const entityIdFilter = { $in: [...storeIds, store._id] }

//   // Build campaign filter for this group
//   const campaignFilter = {
//     entity_id: entityIdFilter,
//     auto_campaign: { $exists: false },
//     status: { $in: ['published', 'completed'] },
//     $and: [
//       { created_at: { $gte: startDate, $lte: endDate } },
//       { schedule_at: { $gte: startDate, $lte: endDate } },
//     ],
//   }

//   // Count campaigns for this brand
//   const campaignCount = await Campaign.countDocuments(campaignFilter)

//   return {
//     entityId: store._id,
//     entityType: 'Group',
//     name: store.name,
//     campaignCount,
//   }
// }

// // Process all individual stores in a single query
// async function processIndividualStores(individualStores, startDate, endDate) {
//   console.log(
//     `\n📊 Processing ${individualStores.length} individual stores in single query...`
//   )

//   const storeIds = individualStores.map(s => s._id)

//   // Build campaign filter for all individual stores
//   const campaignFilter = {
//     entity_id: { $in: storeIds },
//     auto_campaign: { $exists: false },
//     status: { $in: ['published', 'completed'] },
//     $and: [
//       { created_at: { $gte: startDate, $lte: endDate } },
//       { schedule_at: { $gte: startDate, $lte: endDate } },
//     ],
//   }

//   // Aggregate to get campaign count per store
//   const campaignsByStore = await Campaign.aggregate([
//     { $match: campaignFilter },
//     {
//       $group: {
//         _id: '$entity_id',
//         campaignCount: { $sum: 1 },
//       },
//     },
//     { $match: { campaignCount: { $gte: 1 } } },
//   ]).allowDiskUse(true)

//   // Build a map of storeId -> campaignCount
//   const campaignCountMap = new Map()
//   let totalCampaigns = 0
//   for (const item of campaignsByStore) {
//     campaignCountMap.set(item._id.toString(), item.campaignCount)
//     totalCampaigns += item.campaignCount
//   }

//   // Build results for stores with campaigns
//   const brandsWithCampaigns = []
//   for (const store of individualStores) {
//     const count = campaignCountMap.get(store._id.toString())
//     if (count && count >= 1) {
//       brandsWithCampaigns.push({
//         entityId: store._id,
//         entityType: 'Store',
//         name: store.name,
//         campaignCount: count,
//       })
//     }
//   }

//   console.log(
//     `✓ Individual stores: ${brandsWithCampaigns.length} brands with campaigns, ${totalCampaigns} total campaigns`
//   )

//   return {
//     totalCampaigns,
//     uniqueBrandsWithCampaigns: brandsWithCampaigns.length,
//     brandsWithCampaigns,
//   }
// }

// // Process all group brands in parallel batches
// async function processGroupBrands(groups, startDate, endDate) {
//   console.log(
//     `\n📊 Processing ${groups.length} groups in parallel batches of 50...`
//   )

//   const PARALLEL_BATCH_SIZE = 50
//   let totalCampaigns = 0
//   let uniqueBrandsWithCampaigns = 0
//   const brandsWithCampaigns = []
//   let processedCount = 0

//   return new Promise((resolve, reject) => {
//     async.eachLimit(
//       groups,
//       PARALLEL_BATCH_SIZE,
//       function (group, callback) {
//         processGroupBrand(group._id, startDate, endDate)
//           .then(result => {
//             processedCount++

//             if (result) {
//               totalCampaigns += result.campaignCount

//               if (result.campaignCount >= 1) {
//                 uniqueBrandsWithCampaigns++
//                 brandsWithCampaigns.push(result)
//               }
//             }

//             // Log progress every 100 groups
//             if (processedCount % 100 === 0) {
//               console.log(
//                 `Processed ${processedCount}/${groups.length} groups...`
//               )
//             }

//             callback(null)
//           })
//           .catch(error => {
//             console.error(`Error processing group ${group._id}:`, error)
//             callback(null)
//           })
//       },
//       function (error) {
//         if (error) {
//           console.error('Error processing groups:', error)
//           return reject(error)
//         }

//         console.log(
//           `✓ Groups: ${uniqueBrandsWithCampaigns} brands with campaigns, ${totalCampaigns} total campaigns`
//         )

//         resolve({
//           totalCampaigns,
//           uniqueBrandsWithCampaigns,
//           brandsWithCampaigns,
//         })
//       }
//     )
//   })
// }

// async function getCampaignCountsByEntity(
//   groups,
//   individualStores,
//   startDate,
//   endDate
// ) {
//   console.log('\n📊 Fetching campaigns within timeframe...\n')
//   console.log(
//     `Timeframe: ${startDate.toISOString()} to ${endDate.toISOString()}\n`
//   )

//   // Process individual stores in a single query (optimized)
//   const storeResults = await processIndividualStores(
//     individualStores,
//     startDate,
//     endDate
//   )

//   // Process groups in parallel batches (need validateGroupOrStore for each)
//   const groupResults = await processGroupBrands(groups, startDate, endDate)

//   // Combine results
//   const totalCampaigns =
//     storeResults.totalCampaigns + groupResults.totalCampaigns
//   const uniqueBrandsWithCampaigns =
//     storeResults.uniqueBrandsWithCampaigns +
//     groupResults.uniqueBrandsWithCampaigns
//   const brandsWithCampaigns = [
//     ...storeResults.brandsWithCampaigns,
//     ...groupResults.brandsWithCampaigns,
//   ]

//   console.log(`\n${'='.repeat(40)}`)
//   console.log(`Total campaigns matching criteria: ${totalCampaigns}`)
//   console.log(
//     `🏢 Unique brands with at least 1 campaign: ${uniqueBrandsWithCampaigns}`
//   )

//   return {
//     totalCampaigns,
//     uniqueBrandsWithCampaigns,
//     brandsWithCampaigns,
//   }
// }

// async function main() {
//   console.log('='.repeat(60))
//   console.log('Campaign Count Analysis Script')
//   console.log('='.repeat(60))

//   try {
//     let results

//     if (SPECIFIC_ENTITY_ID) {
//       // For specific entity, use processGroupBrand (works for both store and group)
//       console.log(`\n🔍 Filtering by specific entity: ${SPECIFIC_ENTITY_ID}`)
//       const result = await processGroupBrand(
//         SPECIFIC_ENTITY_ID,
//         START_DATE,
//         END_DATE
//       )

//       if (result) {
//         results = {
//           totalCampaigns: result.campaignCount,
//           uniqueBrandsWithCampaigns: result.campaignCount >= 1 ? 1 : 0,
//           brandsWithCampaigns: result.campaignCount >= 1 ? [result] : [],
//         }
//       } else {
//         // Try as individual store
//         const store = await Store.findById(SPECIFIC_ENTITY_ID).lean()
//         if (store) {
//           const storeResults = await processIndividualStores(
//             [store],
//             START_DATE,
//             END_DATE
//           )
//           results = storeResults
//         } else {
//           results = {
//             totalCampaigns: 0,
//             uniqueBrandsWithCampaigns: 0,
//             brandsWithCampaigns: [],
//           }
//         }
//       }
//     } else {
//       // Get all groups and individual stores
//       const { groups, individualStores } = await getEntityIds()

//       // Get campaign counts - optimized: single query for stores, parallel for groups
//       results = await getCampaignCountsByEntity(
//         groups,
//         individualStores,
//         START_DATE,
//         END_DATE
//       )
//     }

//     // Sort brands by campaign count
//     const sortedBrands = results.brandsWithCampaigns.sort(
//       (a, b) => b.campaignCount - a.campaignCount
//     )

//     console.log('\n' + '='.repeat(60))
//     console.log('SUMMARY')
//     console.log('='.repeat(60))
//     console.log(
//       `\n📅 Timeframe: ${START_DATE.toISOString()} to ${END_DATE.toISOString()}`
//     )
//     if (SPECIFIC_ENTITY_ID) {
//       console.log(`🔍 Filtered by Entity ID: ${SPECIFIC_ENTITY_ID}`)
//       if (sortedBrands.length > 0) {
//         const entity = sortedBrands[0]
//         console.log(`📛 Entity Name: ${entity.name}`)
//         console.log(`📦 Entity Type: ${entity.entityType}`)
//       }
//     }
//     console.log(`\n📊 Total Campaigns: ${results.totalCampaigns}`)
//     console.log(
//       `🏢 Unique Brands with at least 1 campaign: ${results.uniqueBrandsWithCampaigns}`
//     )

//     if (sortedBrands.length > 0 && !SPECIFIC_ENTITY_ID) {
//       console.log('\n📈 Top 10 Brands by Campaign Count:')
//       console.log('-'.repeat(60))
//       const top10 = sortedBrands.slice(0, 10)
//       for (let i = 0; i < top10.length; i++) {
//         const brand = top10[i]
//         console.log(
//           `${i + 1}. ${brand.name} (${brand.entityType}): ${
//             brand.campaignCount
//           } campaigns`
//         )
//       }
//     }

//     console.log('\n' + '='.repeat(60))
//     console.log('✅ Script completed successfully')
//     console.log('='.repeat(60))

//     return {
//       totalCampaigns: results.totalCampaigns,
//       uniqueBrandsWithCampaigns: results.uniqueBrandsWithCampaigns,
//       brandsWithCampaigns: sortedBrands,
//     }
//   } catch (error) {
//     console.error('\n❌ Error during analysis:', error)
//     throw error
//   }
// }

// // Main execution
// const handler = async function () {
//   MongoConnection.connect(async function (error, connected) {
//     if (error) {
//       console.error('❌ MongoDB connection error:', error)
//       process.exit(99)
//       return
//     }

//     console.log('✓ Connected to MongoDB\n')

//     try {
//       const result = await main()

//       console.log('\n✅ Script completed successfully')
//       process.exit(0)
//     } catch (exception) {
//       console.error('\n❌ Exception error:', exception)
//       console.error('Stack trace:', exception.stack)
//       console.log('Exiting process with error')
//       process.exit(99)
//     }
//   }, 1)
// }

// // Run the handler
// handler()

