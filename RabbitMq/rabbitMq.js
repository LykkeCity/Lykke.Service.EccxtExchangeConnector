const amqp = require('amqplib')

async function getRabbitMqChannel(settings) {

    if (!settings)
        throw "Settings is not set"

    try
    {
        const eccxt = settings.eccxtExchangeConnector
        const rabbitMq = eccxt.rabbitMq
    
        const connection = await amqp.connect(rabbitMq.connectionString)
        const channel = await connection.createChannel()
        await channel.assertExchange(rabbitMq.orderBooksExchange)
        await channel.assertExchange(rabbitMq.tickPricesExchange)
    
        return channel
    }
    catch (error)
    {
        console.log(error)
    }
    
    throw "This point can't be reached"
}

module.exports = getRabbitMqChannel