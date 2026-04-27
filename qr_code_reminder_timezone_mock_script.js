const dotenv = require('dotenv')
dotenv.config()
const path = require('path')
const moment = require('moment-timezone')
const mongoConnection =
  require('../src/services/mongooseConnection.service.js').getInst()

const timezone = 'Asia/Kuala_Lumpur'
const ownerUserId = '67331fae485fd767d2c5df2b'
const qrCodeId = '69d3828ecbdc9c3754a2e457'
const groupId = '67374aa75d1c2d7300ccc1f5'
const customerId = '69e355f1d6c9449ffa9722c3'

const qrCodeSetting = {
  _id: qrCodeId,
  status: 'active',
  entity_type: 'Group',
  entity_id: groupId,
  reward: {
    reminder: {
      period: 'days',
      duration: 3,
      channels: [
        { name: 'sms', status: false },
        { name: 'whatsapp', status: true },
      ],
    },
    expires_in: {
      period: 'days',
      duration: 5,
    },
  },
}

const customersById = {
  [customerId]: {
    _id: customerId,
    name: 'Fixture Customer',
    email: 'fixture@example.com',
    phone: '+60123456789',
    toObject() {
      return {
        _id: this._id,
        name: this.name,
        email: this.email,
        phone: this.phone,
      }
    },
  },
}

const inactiveChannelsByCustomerId = {
  [customerId]: {
    invalid_channels: [],
    is_blocked: false,
  },
}

const qrCodeScans = [
  {
    _id: '69e358993667cf9fe706a904',
    qr_code_id: qrCodeId,
    entity_id: groupId,
    entity_type: 'Group',
    customer_id: customerId,
    reminder_at: new Date('2026-04-20T18:29:59.999Z'),
    expires_at: new Date('2026-04-23T18:29:59.999Z'),
    reward: {
      reminder: {
        channels: qrCodeSetting.reward.reminder.channels,
      },
    },
  },
  {
    _id: '69e358993667cf9fe706a905',
    qr_code_id: qrCodeId,
    entity_id: groupId,
    entity_type: 'Group',
    customer_id: 'redeemed-customer',
    reminder_at: new Date('2026-04-20T18:29:59.999Z'),
    expires_at: new Date('2026-04-23T18:29:59.999Z'),
    last_redemption_at: new Date('2026-04-20T20:00:00.000Z'),
    reward: {
      reminder: {
        channels: qrCodeSetting.reward.reminder.channels,
      },
    },
  },
]

const runDates = [
  '2026-04-20',
  '2026-04-21',
  '2026-04-22',
  '2026-04-23',
  '2026-04-24',
]

const moduleMocks = new Map()

const cloneValue = value => {
  if (value instanceof Date) return new Date(value.toISOString())
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc, key) => {
      acc[key] = cloneValue(value[key])
      return acc
    }, {})
  }
  return value
}

const getByPath = (value, dottedPath) => {
  return dottedPath.split('.').reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined
    return acc[key]
  }, value)
}

const valuesEqual = (left, right) => {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime()
  }
  return String(left) === String(right)
}

const matchesCondition = (doc, condition) => {
  return Object.entries(condition).every(([key, value]) => {
    if (key === '$or') {
      return value.some(orCondition => matchesCondition(doc, orCondition))
    }

    const fieldValue = getByPath(doc, key)

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      return Object.entries(value).every(([operator, operatorValue]) => {
        if (operator === '$exists') {
          return operatorValue
            ? fieldValue !== undefined
            : fieldValue === undefined
        }
        if (operator === '$in') {
          return operatorValue.some(candidate =>
            valuesEqual(fieldValue, candidate)
          )
        }
        if (operator === '$gte') {
          return fieldValue >= operatorValue
        }
        if (operator === '$lte') {
          return fieldValue <= operatorValue
        }
        return false
      })
    }

    return valuesEqual(fieldValue, value)
  })
}

const evaluateProjection = (doc, projection) => {
  return Object.entries(projection).reduce((acc, [key, value]) => {
    if (value === 1) {
      acc[key] = cloneValue(doc[key])
      return acc
    }

    if (typeof value === 'string' && value.startsWith('$')) {
      acc[key] = cloneValue(getByPath(doc, value.slice(1)))
      return acc
    }

    if (value?.$dateToString) {
      const sourceDate = getByPath(doc, value.$dateToString.date.slice(1))
      acc[key] = moment
        .tz(sourceDate, value.$dateToString.timezone || 'UTC')
        .format('YYYY-MM-DD')
    }

    return acc
  }, {})
}

const evaluateExpression = (doc, expression) => {
  if (typeof expression === 'string' && expression.startsWith('$')) {
    return getByPath(doc, expression.slice(1))
  }

  if (expression?.$eq) {
    const [left, right] = expression.$eq
    return valuesEqual(
      evaluateExpression(doc, left),
      evaluateExpression(doc, right)
    )
  }

  if (expression?.$cond) {
    const [condition, truthyValue, falsyValue] = expression.$cond
    return evaluateExpression(doc, condition)
      ? evaluateExpression(doc, truthyValue)
      : evaluateExpression(doc, falsyValue)
  }

  return expression
}

const applySort = (docs, sort) => {
  const [[field, direction]] = Object.entries(sort)
  return [...docs].sort((left, right) => {
    const leftValue = getByPath(left, field)
    const rightValue = getByPath(right, field)
    if (leftValue === rightValue) return 0
    if (leftValue > rightValue) return direction
    return -direction
  })
}

const applyGroup = (docs, group) => {
  const addToSetPath = group.qr_code_ids.$addToSet.slice(1)
  return [
    {
      _id: group._id,
      qr_code_ids: [...new Set(docs.map(doc => getByPath(doc, addToSetPath)))],
    },
  ]
}

const executeAggregate = pipeline => {
  return pipeline.reduce((docs, stage) => {
    if (stage.$match) {
      return docs.filter(doc => matchesCondition(doc, stage.$match))
    }

    if (stage.$project) {
      return docs.map(doc => evaluateProjection(doc, stage.$project))
    }

    if (stage.$addFields) {
      return docs.map(doc => {
        const nextDoc = { ...doc }
        Object.entries(stage.$addFields).forEach(([field, expression]) => {
          nextDoc[field] = evaluateExpression(doc, expression)
        })
        return nextDoc
      })
    }

    if (stage.$sort) {
      return applySort(docs, stage.$sort)
    }

    if (stage.$group) {
      return applyGroup(docs, stage.$group)
    }

    throw new Error(`Unsupported aggregation stage: ${Object.keys(stage)[0]}`)
  }, qrCodeScans.map(cloneValue))
}

const installModuleMock = (absolutePath, exportsValue) => {
  moduleMocks.set(absolutePath, require.cache[absolutePath])
  require.cache[absolutePath] = {
    id: absolutePath,
    filename: absolutePath,
    loaded: true,
    exports: exportsValue,
  }
}

const restoreModuleMocks = () => {
  moduleMocks.forEach((originalEntry, absolutePath) => {
    if (originalEntry) {
      require.cache[absolutePath] = originalEntry
      return
    }
    delete require.cache[absolutePath]
  })
}

const withMockNow = async (date, tz, task) => {
  const originalNow = moment.now
  const mockedTimestamp = moment
    .tz(`${date} 12:00:00`, 'YYYY-MM-DD HH:mm:ss', tz)
    .valueOf()
  moment.now = () => mockedTimestamp

  try {
    return await task()
  } finally {
    moment.now = originalNow
  }
}

const formatDate = date =>
  moment(date).utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')

const formatAudienceDoc = doc => ({
  customer_id: doc.customer._id,
  reminder_type: doc.qr_reward.reminder_type,
  invalid_channels: doc.invalid_channels,
  is_blocked: doc.is_blocked,
  channels: doc.qr_reward.channels,
})

const printHeader = () => {
  console.log('QR Code Reminder Flow Harness')
  console.log(
    JSON.stringify(
      {
        timezone,
        ownerUserId,
        qrCodeSetting,
        qrCodeScans: qrCodeScans.map(scan => ({
          _id: scan._id,
          qr_code_id: scan.qr_code_id,
          entity_id: scan.entity_id,
          customer_id: scan.customer_id,
          last_redemption_at: scan.last_redemption_at
            ? formatDate(scan.last_redemption_at)
            : null,
          reminder_at_utc: formatDate(scan.reminder_at),
          reminder_at_local: moment
            .tz(scan.reminder_at, timezone)
            .format('YYYY-MM-DD HH:mm:ss.SSS z'),
          expires_at_utc: formatDate(scan.expires_at),
          expires_at_local: moment
            .tz(scan.expires_at, timezone)
            .format('YYYY-MM-DD HH:mm:ss.SSS z'),
        })),
        expected_flow: {
          '2026-04-20': { jobs: [], audience_types: [] },
          '2026-04-21': { jobs: [qrCodeId], audience_types: ['reminder'] },
          '2026-04-22': { jobs: [], audience_types: [] },
          '2026-04-23': { jobs: [], audience_types: [] },
          '2026-04-24': { jobs: [qrCodeId], audience_types: ['expiry'] },
        },
      },
      null,
      2
    )
  )
}

const main = async () => {
  const modelsPath = path.resolve(__dirname, '../src/models/index.js')
  const qrCodeScanModelPath = path.resolve(
    __dirname,
    '../src/models/qr_code_scan.model.js'
  )

  installModuleMock(modelsPath, {
    Feedback: {},
    CustomerSegment: {
      aggregate: async query => {
        const customerIds = query?.[0]?.$match?.customer_id?.$in ?? []
        const invalidChannels = customerIds.reduce((acc, id) => {
          const customerConfig = inactiveChannelsByCustomerId[id]
          if (customerConfig) acc[id] = customerConfig
          return acc
        }, {})

        return invalidChannels && Object.keys(invalidChannels).length > 0
          ? [{ invalid_channels: invalidChannels }]
          : []
      },
    },
    Customer: {
      Customer: {
        populate: async docs => {
          docs.forEach(doc => {
            doc.customer_id = customersById[doc.customer_id]
          })
        },
      },
    },
    QRCodeSetting: {},
    QRCodeScan: {
      aggregate: pipeline => executeAggregate(pipeline),
      aggregatePaginate: async (docs, options) => {
        const totalDocs = docs.length
        const startIndex = (options.page - 1) * options.limit
        const paginatedDocs = docs
          .slice(startIndex, startIndex + options.limit)
          .map(cloneValue)

        return {
          docs: paginatedDocs,
          totalDocs,
          limit: options.limit,
          page: options.page,
          totalPages: Math.ceil(totalDocs / options.limit) || 0,
        }
      },
    },
  })

  installModuleMock(qrCodeScanModelPath, {
    aggregate: pipeline => executeAggregate(pipeline),
  })

  try {
    const {
      getQRCodeReminderAudience,
    } = require('../src/services/qrcode/index.js')
    const QRReminders = require('../src/services/cronReminders/jobs/reminders/qrcode.js')

    printHeader()
    console.log('\nActual module flow')

    for (const runDate of runDates) {
      const result = await withMockNow(runDate, timezone, async () => {
        const reminders = new QRReminders()
        reminders.fetchStoreIdsAndGroupIds = async () => [groupId]

        const jobs = await reminders.execute([ownerUserId], timezone)
        const audience = await getQRCodeReminderAudience(
          qrCodeSetting,
          10,
          1,
          timezone
        )

        return {
          run_date: runDate,
          jobs: jobs.map(job => job.QRCodeId),
          job_payloads: jobs,
          audience_total: audience.totalDocs,
          audience: audience.docs.map(formatAudienceDoc),
        }
      })

      console.log(JSON.stringify(result, null, 2))
    }
  } finally {
    restoreModuleMocks()
  }
}

mongoConnection.connect(async (err, db) => {
  if (err) {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  }
  console.log('Connected to MongoDB')
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
})
