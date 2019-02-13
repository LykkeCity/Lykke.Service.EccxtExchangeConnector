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
        await channel.assertExchange(rabbitMq.OrderBooks, 'fanout', {durable: true})
        await channel.assertExchange(rabbitMq.TickPrices, 'fanout', {durable: true})
    
        return channel
    }
    catch (error)
    {
        console.log(error)
    }
}

module.exports = getRabbitMqChannel