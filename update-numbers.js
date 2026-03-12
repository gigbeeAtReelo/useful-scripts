const dotenv = require('dotenv')
dotenv.config()
const MongoConnection = require('./src/services/mongooseConnection.service.js')
const {
    Store,
    WhatsappHeader,
    ChannelHeader,
    WhatsappUtilityTemplate,
    WhatsappFollowUpMessage,
    Payment,
    MessageTemplate,
} = require('./src/models')

async function updateInWhatsappHeader(phoneNumber, newPhoneNumber) {
    const whatsappHeader = await WhatsappHeader.updateOne({
        phone_number: phoneNumber,
    }, {
        $set: {
            phone_number: newPhoneNumber,
        },
    })
    console.log(
        `Whatsapp header updated for phone number: ${phoneNumber} to ${newPhoneNumber}`
    )
}

async function updateInChannelHeader(phoneNumber, newPhoneNumber) {
    const channelHeader = await ChannelHeader.findOne({
        channels: {
            $elemMatch: { name: 'whatsapp', sender_id: phoneNumber, is_active: true },
        },
    })
    if (channelHeader) {
        channelHeader.channels.find(
            channel =>
                channel.name === 'whatsapp' && channel.sender_id === phoneNumber
        ).sender_id = newPhoneNumber
        await channelHeader.save()
        console.log(
            `Channel header updated for phone number: ${phoneNumber} to ${newPhoneNumber}`
        )
    } else {
        console.log(`Channel header not found for phone number: ${phoneNumber}`)
    }
}

async function updateInPayment(phoneNumber, newPhoneNumber) {
    const payment = await Payment.findOneAndUpdate({
        'category.phone_number': phoneNumber,
    }, {
        $set: {
            'category.phone_number': newPhoneNumber,
        },
    })
    console.log(
        `Payment updated for phone number: ${phoneNumber} to ${newPhoneNumber}`
    )

}

async function updateInWhatsappFollowupTemplates(phoneNumber, newPhoneNumber) {
    const whatsappFollowupTemplates = await WhatsappFollowUpMessage.find({
        phone_number: phoneNumber,
    }).updateMany({ phone_number: newPhoneNumber })
    console.log(
        `Whatsapp followup templates updated for phone number: ${phoneNumber} to ${newPhoneNumber}`
    )
}

async function updateInWhatsappUtilityTemplates(phoneNumber, newPhoneNumber) {
    const whatsappUtilityTemplates = await WhatsappUtilityTemplate.findOne({
        phone_number: phoneNumber,
    }).updateMany({ phone_number: newPhoneNumber })
    console.log(
        `Whatsapp utility templates updated for phone number: ${phoneNumber} to ${newPhoneNumber}`
    )
}

async function updateInMessageTemplate(phoneNumber, newPhoneNumber) {
    const messageTemplate = await MessageTemplate.findOne({
        whatsapp_phone_number: phoneNumber,
    })
    if (messageTemplate) {
        messageTemplate.whatsapp_phone_number = newPhoneNumber
        await messageTemplate.save()
        console.log(
            `Message template updated for phone number: ${phoneNumber} to ${newPhoneNumber}`
        )
    } else {
        console.log(`Message template not found for phone number: ${phoneNumber}`)
    }
}

const numbers = [
    "9115558583824",
    "9115557159833",
    "9115557496956",
    "9115557149686",
    "9115558471880"
]

const mongoConnection = MongoConnection.getInst()

mongoConnection.connect(async (err, db) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }

    await Promise.all(numbers.map(async (number) => {
        const newNum = number.slice(2)
        await updateInWhatsappHeader(number, newNum)
        await updateInChannelHeader(number, newNum)
        await updateInPayment(number, newNum)
        await updateInWhatsappFollowupTemplates(number, newNum)
        await updateInWhatsappUtilityTemplates(number, newNum)
        await updateInMessageTemplate(number, newNum)
    }))
    console.log('All numbers updated')
    process.exit(0)
})

