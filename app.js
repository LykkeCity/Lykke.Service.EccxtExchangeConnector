"use strict";

const ccxt = require('ccxt')
const getRabbitMqChannel = require('./RabbitMq/rabbitMq')
const getSettings = require('./Settings/settings')
const moment = require('moment')

process.on('uncaughtException',  e => { console.log(e); process.exit(1) })
process.on('unhandledRejection', e => { console.log(e); process.exit(1) })

var settings
var channel

(async function main() {
    settings = await getSettings()
    channel = await getRabbitMqChannel(settings)

    produceExchangesData()
})();


async function produceExchangesData() {
    const exchanges = settings.eccxtExchangeConnector.main.exchanges
    const symbols = settings.eccxtExchangeConnector.main.symbols

    await Promise.all(exchanges.map (exchangeName =>
        produceExchangeData(exchangeName, symbols)
    ))
}

async function produceExchangeData(exchangeName, symbols) {

    return new Promise(async (resolve, reject) => {

        const rateLimit = settings.eccxtExchangeConnector.main.rateLimitInMilliseconds
        var exchange = new ccxt[exchangeName]({ rateLimit: rateLimit, enableRateLimit: true })
        await exchange.loadMarkets()

        var availableSymbols = intersect(exchange.symbols, symbols);
        if (availableSymbols.length === 0)
            reject(exchange + " doesn't have any symbols from config");

        let currentProxy = 0

        while (true) {
            for (const symbol of availableSymbols){
                try {
                    await produceOrderBook(exchange, symbol);

                    //TODO: Change proxy if request took too long
                }
                catch (e) {
                    // wait
                    if (e instanceof ccxt.DDoSProtection
                        || e instanceof ccxt.ExchangeNotAvailable
                        || (e.message && e.message.includes('ECONNRESET'))
                        || (e.error && e.error === 1015)
                        || e instanceof ccxt.RequestTimeout
                        || (e.message && e.message.includes('timed out')))
                    {
                        console.log(e)
                        var proxies = settings.eccxtExchangeConnector.main.proxies
                        currentProxy = ++currentProxy % proxies.length
                        exchange.proxy = proxies[currentProxy]
                        //await sleep(1000 * 65)
                    // ignore
                    //} else if (e instanceof ccxt.RequestTimeout || (e.message && e.message.includes('timed out'))) {
                    //   console.log (e)
                    //}
                    } else {
                        console.log (e)
                        //throw e;
                    }
                }
            }
        }

    });

}

async function produceOrderBook(exchange, symbol){
    //exchange.headers = User-Agent:"Ubuntu Chromium/34.0.1847.116
    const orderBook = await exchange.fetchL2OrderBook(symbol)

    var timestamp = moment.utc().toISOString()
    timestamp = timestamp.substring(0, timestamp.indexOf('.'))
    var base = symbol.substring(0, symbol.indexOf('/'))
    var quote = symbol.substring(symbol.indexOf("/") + 1);
    let bestBid = orderBook.bids.length ? orderBook.bids[0] : undefined
    let bestAsk = orderBook.asks.length ? orderBook.asks[0] : undefined
    var orderBookObj = {
        'source': exchange.id,
        'asset': symbol.replace("/", ""),
        'AssetPair': { 'base': base, 'quote': quote },
        'timestamp': timestamp
    }

    var bids = []
    for(const bid of orderBook.bids){
        bids.push({ 'price': bid[0], 'volume': bid[1] })
    }
    orderBookObj.bids = bids

    var asks = []
    for(const ask of orderBook.asks){
        asks.push({ 'price': ask[0], 'volume': ask[1] })
    }
    orderBookObj.asks = asks

    var orderBookJson = JSON.stringify(orderBookObj)
    const orderBooksExchange = settings.eccxtExchangeConnector.rabbitMq.orderBooksExchange
    channel.publish(orderBooksExchange, '', new Buffer(orderBookJson))

    console.log (moment().format("dd.MM.YYYY hh:mm:ss") + " " + orderBookObj.source + ", proxy: " + exchange.proxy)
}

function intersect(a, b) {
    var setA = new Set(a);
    var setB = new Set(b);
    var intersection = new Set([...setA].filter(x => setB.has(x)));
    return Array.from(intersection);
}

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}