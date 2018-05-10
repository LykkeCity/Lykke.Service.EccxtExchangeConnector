const amqp = require('amqplib')

async function getRabbitMqChannel(settings) {

    if (!settings)
        throw "Settings is not set"

    try
    {
        const eccxt = settings.EccxtExchangeConnector
        const rabbitMq = eccxt.RabbitMq
    
        const connection = await amqp.connect(rabbitMq.ConnectionString)
        const channel = await connection.createChannel()
        await channel.assertExchange(rabbitMq.OrderBooks, 'fanout', {durable: false})
        await channel.assertExchange(rabbitMq.TickPrices, 'fanout', {durable: false})
    
        return channel
    }
    catch (error)
    {
        console.log(error)
    }
    
    throw "This point can't be reached"
}

module.exports = getRabbitMqChannel